# Kumo Reader — consignes pour Claude

Lire aussi [PROJECT.md](PROJECT.md) (vision, architecture, journal des décisions).

## Sources : garder la doc à jour

[docs/sources.md](docs/sources.md) décrit ce que chaque source doit implémenter. Elle doit
toujours correspondre au code.

À chaque changement qui touche le contrat des sources, mettre à jour `docs/sources.md` **dans
le même commit** (ou le commit suivant immédiatement). C'est le cas pour :

- une méthode ajoutée, retirée ou rendue obligatoire/facultative ;
- un champ ajouté ou modifié dans ce que renvoie une méthode (`Manga`, chapitres, pages,
  `discover`, `catalog`…) ;
- une limite ou validation changée dans `sources/parse.ts`, `sources/api.ts` ou
  `sources/manifest.ts` (nombres maximaux, longueurs, valeurs acceptées) ;
- une règle du bac à sable changée dans `native-bridge/SourceHost.tsx` ou
  `native-bridge/sandboxHtml.ts` (`app.fetch`, en-têtes, délais, tailles) ;
- un changement du manifeste, du build (`scripts/build-source-repo.mjs`), de la publication
  ou du suivi de santé ;
- une nouvelle règle sur le contenu (classification, contenu sensible, exclusions).

Mettre aussi à jour le tableau récapitulatif en fin de document.
