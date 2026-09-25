export function sandboxHtml(bundle: string): string {
  const encoded = JSON.stringify(bundle).replace(/</g, '\\u003c');
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; connect-src 'none'; img-src 'none'; frame-src 'none'">
</head><body><script>
(function () {
  var pending = Object.create(null);
  var nextId = 1;
  function send(message) { window.ReactNativeWebView.postMessage(JSON.stringify(message)); }
  window.app = {
    fetch: function (url, options) {
      return new Promise(function (resolve, reject) {
        var id = String(nextId++);
        pending[id] = { resolve: resolve, reject: reject };
        send({ type: 'fetch', id: id, url: url, options: options || {} });
      });
    }
  };
  window.__hostMessage = function (message) {
    if (message.type === 'fetchResult') {
      var wait = pending[message.id];
      if (!wait) return;
      delete pending[message.id];
      if (message.error) wait.reject(new Error(message.error));
      else wait.resolve(message.result);
      return;
    }
    if (message.type === 'call') {
      Promise.resolve().then(function () {
        if (!window.source || typeof window.source[message.method] !== 'function') {
          throw new Error('Méthode absente : ' + message.method);
        }
        return window.source[message.method].apply(window.source, message.args || []);
      }).then(function (result) {
        send({ type: 'result', id: message.id, result: result });
      }, function (error) {
        send({ type: 'result', id: message.id, error: String(error && error.message || error) });
      });
    }
  };
  try {
    (0, eval)(${encoded});
    if (!window.source || typeof window.source !== 'object') throw new Error('source absent');
    send({ type: 'ready' });
  } catch (error) {
    send({ type: 'fatal', error: String(error && error.message || error) });
  }
})();
</script></body></html>`;
}
