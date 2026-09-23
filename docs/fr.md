# Stock de pellets

Cette intégration suit votre **stock de pellets** (granulés de bois) : livraisons, consommation, consommation moyenne par jour et autonomie restante. Elle ajoute un **widget** au tableau de bord, un appareil virtuel pour l'historique et les scènes, et une action de scène.

Aucun matériel ni compte en ligne n'est nécessaire : l'intégration tient un registre des mouvements de sacs et en déduit tout le reste.

## Premiers pas

1. Ouvrez l'onglet **Configuration** de l'intégration et vérifiez le poids d'un sac (15 kg par défaut) et le nombre de sacs par palette (66 par défaut).
2. Lancez l'action **« Corriger le stock »** et indiquez le nombre de sacs que vous avez actuellement.
3. Ajoutez le widget **« Stock de pellets »** à votre tableau de bord (modifier le tableau de bord → ajouter une boîte → Stock de pellets).

## Au quotidien

- Appuyez sur **« −1 sac »** dans le widget à chaque fois que vous remplissez le poêle.
- Appuyez sur **« +1 sac »** pour chaque sac acheté à l'unité (en magasin par exemple).
- Appuyez sur **« Palette livrée »** à chaque livraison d'une palette : le nombre de sacs par palette est ajouté (une confirmation est demandée).
- Une fausse manipulation ? **« Annuler »** retire la dernière opération.
- Pour ajouter plusieurs sacs d'un coup (une demi-palette, un lot de 10 sacs…), utilisez l'action **« Enregistrer une livraison »** de la configuration.

Vous n'êtes pas obligé d'appuyer à chaque sac : **recompter le stock** de temps en temps avec « Corriger le stock » suffit. Les sacs manquants depuis le dernier comptage sont comptés comme consommés.

## Ce qu'affiche le widget

- **Stock** en sacs : vert, puis orange sous le seuil de stock bas (10 sacs par défaut), rouge à zéro. Un rappel « Pensez à commander » apparaît alors.
- **Autonomie** en jours.
- Un **graphique** de l'évolution du stock, avec les livraisons repérées (période réglable : 1 mois, 3 mois, 1 an).
- La **consommation moyenne par jour**, le **poids restant**, la **dernière livraison** et la **date estimée** à laquelle le stock sera vide.

Sur le graphique, seules les livraisons de plusieurs sacs sont repérées : les sacs ajoutés un par un ne sont pas marqués, pour ne pas masquer les palettes.

Dans les réglages du widget, vous pouvez **masquer les boutons**, par exemple pour un écran mural en lecture seule.

## Comment l'autonomie est calculée

La consommation moyenne est calculée sur les **14 derniers jours** (réglable de 3 à 90 jours dans la configuration). Plus court, elle suit plus vite la météo ; plus long, elle est plus stable.

- Tant qu'il y a **moins d'un jour d'historique**, l'autonomie reste inconnue (un tiret s'affiche) : un seul sac utilisé ne permet pas d'extrapoler.
- Sans **aucune consommation** sur la période (en été par exemple), l'autonomie est également inconnue.

## Appareil « Stock de pellets » (optionnel)

Depuis l'onglet **Découverte**, vous pouvez ajouter l'appareil **« Stock de pellets »**. Il expose deux valeurs avec historique :

- **Stock de pellets** (nombre de sacs) ;
- **Autonomie pellets** (jours).

Il permet d'afficher l'historique dans une boîte graphique classique et, surtout, de créer des **scènes** : par exemple « quand le stock passe sous 10 sacs, m'envoyer un message ». Une autonomie inconnue n'est jamais envoyée comme 0, pour ne pas déclencher une scène « stock vide » à tort.

Le widget fonctionne sans cet appareil.

## Scène : « Utiliser des sacs de pellets »

Dans l'éditeur de scène, l'action **« Utiliser des sacs de pellets »** retire des sacs du stock. Exemple : un bouton Zigbee posé à côté du poêle, qui déclenche une scène retirant un sac à chaque appui.

L'action renvoie aux actions suivantes de la scène le **nombre de sacs restants** et l'**autonomie** en jours. Elle échoue si le stock enregistré est insuffisant : recomptez alors votre stock.

## Sauvegarde

Le registre des mouvements (les 500 derniers) est enregistré dans la base de Gladys : il fait partie des **sauvegardes Gladys** et survit à une mise à jour de l'intégration. Il est supprimé si vous désinstallez l'intégration.
