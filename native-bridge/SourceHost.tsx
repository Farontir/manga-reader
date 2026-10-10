import { File } from 'expo-file-system';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, View } from 'react-native';
import WebView, { type WebViewMessageEvent } from 'react-native-webview';

import type { InstalledSource } from '../db';
import { appFileUri } from '../services/appFiles';
import { parseManifest } from '../sources/manifest';
import type { SourceMethod } from '../sources/types';
import { registerSourceDispatcher } from './sourceClient';
import { sandboxHtml } from './sandboxHtml';

// `generation` makes every (re)load a new WebView, even for the same bundle.
type Session = { key: string; generation: number; html: string; source: InstalledSource };
type Pending = { resolve: (result: unknown) => void; reject: (error: Error) => void };
type Packet = Record<string, unknown>;

// After this long in the background, iOS has often killed the WebView's content process.
const STALE_AFTER_BACKGROUND_MS = 30 * 1000;
const NOT_RESPONDING = 'La source ne répond pas.';

function asPacket(value: string): Packet | null {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Packet)
      : null;
  } catch {
    return null;
  }
}

export function SourceHost() {
  const web = useRef<WebView>(null);
  const [session, setSession] = useState<Session | null>(null);
  const active = useRef<Session | null>(null);
  const ready = useRef<Pending | null>(null);
  const pending = useRef(new Map<string, Pending>());
  const queue = useRef<Promise<void>>(Promise.resolve());
  const nextId = useRef(1);
  const lastFetch = useRef(new Map<string, number>());
  const generation = useRef(0);
  const backgroundAt = useRef<number | null>(null);

  // Drops the sandbox: anything waiting on it fails now, and the next call reloads the
  // bundle in a fresh WebView. Without this a dead WebView kept the source "loaded" and
  // every call timed out until the source was reinstalled.
  const invalidate = useCallback((reason: string) => {
    active.current = null;
    ready.current?.reject(new Error(reason));
    ready.current = null;
    for (const wait of pending.current.values()) wait.reject(new Error(reason));
    pending.current.clear();
    setSession(null);
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') backgroundAt.current = Date.now();
      if (state === 'active') {
        const since = backgroundAt.current;
        backgroundAt.current = null;
        // Reload lazily: the next source call starts a fresh sandbox.
        if (since !== null && Date.now() - since > STALE_AFTER_BACKGROUND_MS) {
          active.current = null;
        }
      }
    });
    return () => subscription.remove();
  }, []);

  const send = useCallback((packet: Packet) => {
    web.current?.injectJavaScript(`window.__hostMessage(${JSON.stringify(packet)}); true;`);
  }, []);

  const handleFetch = useCallback(
    async (packet: Packet) => {
      const source = active.current?.source;
      const id = packet.id;
      if (!source || typeof id !== 'string') return;
      try {
        if (typeof packet.url !== 'string') throw new Error('URL invalide.');
        const url = new URL(packet.url);
        const manifest = parseManifest(JSON.parse(source.manifestJson) as unknown);
        if (
          url.protocol !== 'https:' ||
          !manifest.allowedHosts.includes(url.hostname.toLowerCase())
        ) {
          throw new Error('Domaine non autorisé pour cette source.');
        }
        const options =
          packet.options && typeof packet.options === 'object' && !Array.isArray(packet.options)
            ? (packet.options as Packet)
            : {};
        const method = options.method ?? 'GET';
        if (method !== 'GET' && method !== 'POST') throw new Error('Méthode HTTP non autorisée.');
        const body =
          typeof options.body === 'string' && options.body.length <= 100_000
            ? options.body
            : undefined;
        if (method === 'POST' && body === undefined) throw new Error('Corps POST invalide.');
        const rawHeaders =
          options.headers && typeof options.headers === 'object' && !Array.isArray(options.headers)
            ? (options.headers as Packet)
            : {};
        const headers: Record<string, string> = {};
        for (const [key, value] of Object.entries(rawHeaders)) {
          if (
            ['accept', 'referer', 'authorization', 'x-api-key', 'content-type'].includes(
              key.toLowerCase(),
            ) &&
            typeof value === 'string'
          ) {
            headers[key] = value;
          }
        }
        const elapsed = Date.now() - (lastFetch.current.get(source.id) ?? 0);
        if (elapsed < 350) await new Promise((resolve) => setTimeout(resolve, 350 - elapsed));
        lastFetch.current.set(source.id, Date.now());
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        try {
          const response = await fetch(url.toString(), {
            method,
            body,
            headers,
            signal: controller.signal,
          });
          const responseBody = await response.text();
          if (responseBody.length > 2_000_000) throw new Error('Réponse trop volumineuse.');
          send({
            type: 'fetchResult',
            id,
            result: { status: response.status, body: responseBody },
          });
        } finally {
          clearTimeout(timeout);
        }
      } catch (reason) {
        send({
          type: 'fetchResult',
          id,
          error: reason instanceof Error ? reason.message : String(reason),
        });
      }
    },
    [send],
  );

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const packet = asPacket(event.nativeEvent.data);
      if (!packet) return;
      if (packet.type === 'ready') {
        ready.current?.resolve(undefined);
        ready.current = null;
      }
      if (packet.type === 'fatal') {
        ready.current?.reject(new Error(String(packet.error)));
        ready.current = null;
      }
      if (packet.type === 'result' && typeof packet.id === 'string') {
        const wait = pending.current.get(packet.id);
        pending.current.delete(packet.id);
        if (packet.error) wait?.reject(new Error(String(packet.error)));
        else wait?.resolve(packet.result);
      }
      if (packet.type === 'fetch') void handleFetch(packet);
    },
    [handleFetch],
  );

  const load = useCallback(async (source: InstalledSource, key: string) => {
    const bundle = await new File(appFileUri(source.bundleUri)).text();
    generation.current += 1;
    const nextSession = { key, generation: generation.current, html: sandboxHtml(bundle), source };
    active.current = nextSession;
    const loading = new Promise<void>((resolve, reject) => {
      ready.current = { resolve: () => resolve(), reject };
    });
    setSession(nextSession);
    try {
      await Promise.race([
        loading,
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error('Source indisponible.')), 12000),
        ),
      ]);
    } catch (error) {
      active.current = null;
      ready.current = null;
      throw error;
    }
  }, []);

  const call = useCallback(
    (method: SourceMethod, args: unknown[]) => {
      const id = String(nextId.current++);
      return new Promise<unknown>((resolve, reject) => {
        pending.current.set(id, { resolve, reject });
        send({ type: 'call', id, method, args });
        setTimeout(() => {
          if (pending.current.has(id)) {
            pending.current.delete(id);
            reject(new Error(NOT_RESPONDING));
          }
        }, 20000);
      });
    },
    [send],
  );

  const run = useCallback(
    async (source: InstalledSource, method: SourceMethod, args: unknown[]): Promise<unknown> => {
      const manifest = parseManifest(JSON.parse(source.manifestJson) as unknown);
      const key = `${source.id}:${manifest.sha256}`;
      const reused = active.current?.key === key;
      if (!reused) await load(source, key);
      try {
        return await call(method, args);
      } catch (error) {
        if (!(error instanceof Error) || error.message !== NOT_RESPONDING) throw error;
        invalidate(NOT_RESPONDING);
        // A sandbox loaded earlier may have died silently: reload it and try once more.
        // A freshly loaded one that does not answer is a real source problem.
        if (!reused) throw error;
        await load(source, key);
        return call(method, args);
      }
    },
    [call, invalidate, load],
  );

  useEffect(
    () =>
      registerSourceDispatcher((source, method, args) => {
        const job = queue.current.then(() => run(source, method, args));
        queue.current = job.then(
          () => undefined,
          () => undefined,
        );
        return job;
      }),
    [run],
  );

  return (
    <View pointerEvents="none" style={{ width: 1, height: 1, opacity: 0, position: 'absolute' }}>
      {session ? (
        <WebView
          key={`${session.key}#${session.generation}`}
          ref={web}
          source={{ html: session.html }}
          onMessage={onMessage}
          javaScriptEnabled
          domStorageEnabled={false}
          originWhitelist={['about:blank']}
          scrollEnabled={false}
          onError={(event) => {
            ready.current?.reject(new Error(event.nativeEvent.description));
            ready.current = null;
          }}
          // iOS kills WebView content processes in the background or under memory pressure.
          onContentProcessDidTerminate={() => invalidate('La source a été interrompue.')}
          onRenderProcessGone={() => invalidate('La source a été interrompue.')}
        />
      ) : null}
    </View>
  );
}
