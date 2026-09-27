# Validation sur iPhone réel

Commencer avec **Expo Go SDK 57**, accessible sans compte Apple Developer : `npm install`, `npx expo login`, puis `npm start`. Se connecter au même compte Expo sur l'iPhone. Noter la version iOS, le modèle, les résultats et les captures d'écran des anomalies. Plus tard, refaire ces parcours sur un **build de développement EAS** puis sur le build de distribution avant soumission.

Sur Expo Go, laisser de côté la tâche planifiée en arrière-plan, les comportements propres aux builds distribués et l'écran de démarrage natif. Le téléchargement au premier plan et la reprise lorsque l'app revient au premier plan restent à vérifier.

## Démarrage et bibliothèque

- [ ] Installer l'app vierge, l'ouvrir sans source, vérifier que les onglets Bibliothèque, Recherche, Sources et Réglages s'affichent sans erreur.
- [ ] Ajouter un manga via AniList, fermer complètement l'app, la rouvrir et retrouver le manga.
- [ ] Passer iOS du mode clair au mode sombre et vérifier les écrans principaux.

## Fichiers locaux et lecteur

- [ ] Importer un CBZ de plus de 200 pages, puis un dossier d'images ; vérifier l'ordre des pages et la couverture.
- [ ] Surveiller un dossier contenant plusieurs CBZ (dont un sous-dossier par série) : vérifier séries, tomes et chapitres détectés.
- [ ] Ajouter un CBZ dans ce dossier via Fichiers, revenir dans l'app après une minute : il est importé seul, les autres ne sont pas rouverts.
- [ ] Fermer complètement l'app puis la rouvrir : si l'accès est perdu, **Rechoisir** rouvre le sélecteur sur le dossier et la synchro reprend.
- [ ] Supprimer un manga importé depuis le dossier surveillé : il ne revient pas au scan suivant.
- [ ] Parcourir le chapitre en mode paginé puis vertical ; tester balayage, pincement, double toucher et changement de mode.
- [ ] En mode webtoon, sur un chapitre à planches très hautes : défilement fluide sans trou ni saut, pas de changement de page latéral, barre d'outils masquée au défilement et réaffichée par un toucher, progression reprise à la bonne planche.
- [ ] Fermer l'app à la page N, la rouvrir et reprendre à la même page. Vérifier la progression après un changement de mode.
- [ ] Lire un long chapitre jusqu'à la fin sans fermeture de l'app ni forte dégradation de fluidité. Vérifier l'espace utilisé par le cache après plusieurs chapitres.
- [ ] Supprimer un manga local et vérifier que ses fichiers et sa progression disparaissent.

## Sources et résilience

- [ ] Publier les trois dossiers de `source-repo/` en HTTPS, installer MangaDex, Komga Demo et Pepper&Carrot par leur URL.
- [ ] Pour chaque source : rechercher un titre, ouvrir sa fiche, charger les chapitres et lire plusieurs pages.
- [ ] Installer une mise à jour d'une source ; vérifier que la bibliothèque et la progression restent intactes.
- [ ] Associer deux sources au même manga, privilégier l'autre source d'un toucher, puis vérifier le chapitre et la page repris.
- [ ] Simuler l'indisponibilité d'une source liée et vérifier le basculement. Désinstaller toutes les sources et confirmer que la bibliothèque et la progression restent visibles.
- [ ] Vérifier l'affichage des états opérationnelle, à surveiller et indisponible après une vérification de santé.

## Hors ligne et sauvegarde

- [ ] Télécharger un chapitre, activer le mode avion et lire toutes ses pages.
- [ ] Commencer un téléchargement, mettre l'app en arrière-plan, la rouvrir et vérifier la reprise des pages manquantes.
- [ ] Sur un build natif ultérieur : répéter après fermeture de l'app pour vérifier la tâche planifiée ; iOS peut la différer.
- [ ] Exporter le JSON vers Fichiers ou iCloud Drive, puis l'importer sur une installation fraîche. Vérifier les titres, liaisons, numéros de chapitre et pages lues.
- [ ] Réinstaller les sources proposées après restauration ; réimporter les CBZ et retélécharger les images, car les fichiers ne sont pas dans le JSON.

## Avant App Store Connect

- [ ] Refaire les parcours ci-dessus avec le build de distribution et capturer les vrais écrans iPhone.
- [ ] Vérifier la politique de confidentialité publiée, les coordonnées de l'éditeur, les droits des contenus et les URL des sources publiques.
- [ ] Fournir à l'équipe de revue une URL de source fonctionnelle et, si nécessaire, un CBZ de démonstration dont la distribution est autorisée.
