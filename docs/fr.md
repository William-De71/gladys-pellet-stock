# Stock de pellets

Cette intégration suit votre **stock de pellets** (granulés de bois), en sacs ou en silo, un par maison : livraisons, consommation, consommation moyenne par jour, autonomie restante et coût du chauffage. Elle ajoute des **widgets** au tableau de bord, un appareil virtuel par stock pour l'historique et les scènes, des actions et des déclencheurs de scène.

Aucun matériel ni compte en ligne n'est nécessaire : l'intégration tient un registre des mouvements de sacs et en déduit tout le reste.

![Deux widgets « Stock de pellets » : l'évolution du stock avec ses boutons, et les sacs utilisés par jour (illustration)](https://raw.githubusercontent.com/William-De71/gladys-pellet-stock/main/docs/assets/widget-stock.fr.png)

## Premiers pas

1. Ouvrez l'onglet **Configuration** de l'intégration et vérifiez le poids d'un sac (15 kg par défaut) et le nombre de sacs par palette (66 par défaut).
2. Lancez l'action **« Corriger le stock »** et indiquez le nombre de sacs que vous avez actuellement.
3. Ajoutez le widget **« Stock de pellets »** à votre tableau de bord (modifier le tableau de bord → ajouter une boîte → Stock de pellets).

## Au quotidien

- Appuyez sur **« Enlever sac(s) »** dans le widget à chaque fois que vous remplissez le poêle. Un petit formulaire s'ouvre, pré-rempli à 1 sac : envoyez-le, ou indiquez un autre nombre.
- Appuyez sur **« Ajouter sac(s) »** pour des sacs achetés à l'unité (en magasin par exemple). Le formulaire demande le nombre de sacs et le **prix au sac**, pré-rempli avec le dernier prix connu ; le prix est facultatif.
- Appuyez sur **« Palette livrée »** à chaque livraison d'une palette. Le formulaire est pré-rempli avec le nombre de sacs par palette, le prix d'une palette au dernier prix payé par sac et le **poids d'un sac** de la configuration : corrigez-les si besoin, puis envoyez. Le prix est facultatif ; mettez 0 pour une livraison sans prix.
- Sur une version de Gladys sans ces formulaires, les boutons enlèvent ou ajoutent 1 sac, et « Palette livrée » ajoute le nombre de sacs par palette (une confirmation est demandée).
- Une fausse manipulation ? **« Annuler »** retire la dernière opération.
- Pour ajouter plusieurs sacs d'un coup (une demi-palette, un lot de 10 sacs…), utilisez l'action **« Enregistrer une livraison »** de la configuration, où le prix payé peut aussi être indiqué.

Vous n'êtes pas obligé d'appuyer à chaque sac : **recompter le stock** de temps en temps avec « Corriger le stock » suffit. Les sacs manquants depuis le dernier comptage sont comptés comme consommés.

## Ce qu'affiche le widget

- **Stock** en sacs : vert, puis orange sous le seuil de stock bas (10 sacs par défaut), rouge à zéro. Un rappel « Pensez à commander » apparaît alors.
- **Autonomie** en jours.
- Un **graphique**, au choix dans les réglages du widget : l'**évolution du stock**, avec les livraisons repérées, ou les **sacs utilisés par jour** en barres (par semaine sur 1 an). Période réglable : 1 mois, 3 mois, 1 an. Pour voir les deux, mettez deux widgets côte à côte. Les sacs manquants trouvés lors d'un recomptage sont comptés le jour du recomptage.
- La **consommation moyenne par jour**, le **dernier sac utilisé** (« il y a 2 jours »), le **poids restant**, la **dernière livraison** et la **consommation depuis** (en sacs et en kg).
- La date à laquelle **commander** (quand le stock atteindra le seuil de stock bas) et la **date estimée** à laquelle le stock sera vide.
- Dès qu'un prix est connu : la **valeur du stock**, avec le **prix au sac et au kg**, et le **coût par mois**. C'est le prix payé lors de la dernière livraison qui compte, ou, à défaut, le **prix d'une palette** de la configuration. Le prix au kg tient compte du poids des sacs de cette livraison.
- Le **coût de la saison** : ce qu'ont coûté les sacs utilisés depuis le début de la saison de chauffe (octobre par défaut, réglable dans les réglages du widget), avec leur nombre.

Seules les livraisons (« Palette livrée », l'action « Enregistrer une livraison ») comptent comme livraisons : les sacs ajoutés avec « Ajouter sac(s) », même plusieurs à la fois, ne sont ni repérés sur le graphique, ni pris en compte pour « Dernière livraison » et la consommation depuis. Ils entrent bien dans le stock et dans le coût.

Dans les réglages du widget, vous pouvez **masquer les boutons**, par exemple pour un écran mural en lecture seule.

## Coût du chauffage

Les sacs les plus anciens partent en premier (« premier entré, premier sorti ») : chaque sac utilisé coûte le prix auquel il a été acheté. Si vous avez acheté 40 sacs à 6 € puis 60 sacs à 8 €, les 40 premiers sacs utilisés comptent pour 6 € chacun, les suivants pour 8 €.

- Une livraison saisie sans prix prend le **dernier prix au sac connu**.
- Le stock indiqué au départ avec « Corriger le stock » n'a pas de prix : il prend le **prix d'une palette** de la configuration, ou, sans lui, il est signalé à part (« 12 sans prix »). « Corriger le stock » accepte un **prix au sac** facultatif pour les sacs comptés en plus du stock enregistré.
- Le **poids restant** et la consommation en kg tiennent compte du poids des sacs de chaque livraison.

Pour une période précise, lancez l'action **« Analyser le coût »** avec une date de début et de fin (JJ/MM/AAAA) : « Du 01/10/2026 au 01/06/2027 : 100 sacs, 1 500 kg, 712 € (0,47 €/kg) ».

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

## Plusieurs maisons

Pour suivre les pellets d'une autre maison (une résidence secondaire, un chalet…), lancez l'action **« Ajouter un stock »** dans la configuration et choisissez la maison dans la liste des maisons de Gladys. Le stock prend le nom de la maison, un stock par maison. Chaque stock a son propre historique et son propre appareil :

1. Dans l'onglet **Découverte**, ajoutez l'appareil **« Stock de pellets – Chalet »** (avec le nom de la maison) et placez-le dans une pièce de cette maison.
2. Lancez **« Corriger le stock »** en choisissant ce stock, pour indiquer ses sacs actuels.
3. Ajoutez un widget **« Stock de pellets »** et choisissez ce stock dans ses réglages. Son nom apparaît dans le titre du graphique.

Les actions de la configuration et l'action de scène ont un champ **Stock** : laissé vide, elles portent sur le stock principal. Un bouton Zigbee du chalet peut ainsi décompter uniquement le stock du chalet.

Les réglages de la configuration (poids d'un sac, sacs par palette, seuil, période, prix d'une palette) sont les **réglages par défaut** de tous les stocks. Pour qu'un stock en ait d'autres (des sacs de 10 kg au chalet, par exemple), lancez **« Régler un stock »** : remplissez seulement les réglages à changer, les autres gardent leur valeur. La réponse récapitule les réglages en vigueur, propres au stock ou par défaut. L'option **« Revenir aux valeurs par défaut »** retire les réglages propres au stock.

Le stock principal, et les stocks ajoutés avec un nom dans une version précédente, peuvent être rattachés à une maison avec **« Rattacher un stock à une maison »** : ils prennent le nom de la maison, et gardent leur appareil et leur historique.

Pour lire le nom des maisons, l'intégration demande l'accès aux maisons de Gladys (affiché à l'installation) ; elle n'utilise pas leurs coordonnées.

**« Supprimer un stock »** retire un stock ajouté et son historique ; le stock principal ne peut pas être supprimé.

## Silo (pellets en vrac)

![Le formulaire « Palette livrée » ouvert sur le widget « Stock de pellets », à côté du widget « Silo de pellets » (illustration)](https://raw.githubusercontent.com/William-De71/gladys-pellet-stock/main/docs/assets/widget-silo.fr.png)

Pour une chaudière alimentée par un silo, lancez **« Ajouter un stock »** avec le type **Silo (vrac)** et la maison. Un silo compte en **kg** et a son propre widget, **« Silo de pellets »**, et son propre appareil, **« Silo de pellets – Maison »** (niveau en kg, remplissage en %, autonomie). Une maison peut avoir un stock de sacs et un silo.

- **« Livraison »** : les kg livrés (pré-remplis avec la livraison habituelle) et le prix payé.
- **« Relevé de niveau »** : le niveau lu sur le silo, en kg ou en % de la capacité (réglage « Relevé du niveau »). Un niveau plus bas que le précédent compte comme consommation : la consommation par jour, l'autonomie, la date de commande et le coût de la saison se calculent comme pour les sacs.
- **« Annuler »** retire la dernière opération.

Le widget affiche le niveau (en tonnes au-delà de 1 000 kg), l'autonomie, l'évolution du niveau ou les kg utilisés par jour, le remplissage, le dernier relevé, la dernière livraison, la valeur du stock et le prix au kg, le coût par mois et de la saison, et la date à laquelle commander.

Les réglages par défaut des silos sont dans la section **« Silo »** de la configuration : capacité, seuil de stock bas (kg), livraison habituelle, prix à la tonne, relevé en kg ou en %. « Régler un stock » les change pour un silo. Laissé sans stock choisi, le widget et les actions de scène du silo prennent le seul silo.

Deux actions de scène, **« Enregistrer une livraison du silo »** et **« Relever le niveau du silo »**, permettent par exemple d'alimenter le niveau depuis un capteur. Les déclencheurs de scène comptent en sacs et ne concernent pas les silos : pour une alerte, utilisez l'appareil du silo (« niveau du silo inférieur à… »).

## Scènes

### Actions

- **« Utiliser des sacs de pellets »** retire des sacs du stock. Exemple : un bouton Zigbee posé à côté du poêle, qui déclenche une scène retirant un sac à chaque appui. L'action échoue si le stock enregistré est insuffisant : recomptez alors votre stock.
- **« Ajouter des sacs de pellets »** ajoute des sacs (une livraison, des sacs achetés à l'unité), avec un prix au sac et un poids de sac facultatifs.
- **« Corriger le stock de pellets »** fixe le stock au nombre de sacs comptés.
- **« Lire le stock de pellets »** ne modifie rien : elle sert à récupérer les chiffres pour la suite de la scène, par exemple un message hebdomadaire. Elle renvoie en plus le **type** du stock (`bags` ou `bulk`), son **unité** (`bag` ou `kg`) et le **coût de la saison** : le coût (€), les sacs (kg pour un silo) et les kg utilisés depuis le début de la saison (octobre par défaut, réglable dans l'action), et ceux sans prix connu.

Chaque action a un champ **Stock** (vide : le stock principal) et renvoie aux actions suivantes les **sacs restants**, l'**autonomie** (jours), les **sacs par jour**, les **jours avant de commander** et le **poids restant** (kg). Une valeur encore inconnue (autonomie sans consommation, par exemple) n'est pas renvoyée, plutôt que de valoir 0.

### Déclencheurs

- **« Stock de pellets bas »** : le stock descend au seuil de stock bas de la configuration. Il se déclenche une fois, au passage du seuil, pas à chaque sac en dessous.
- **« Stock de pellets épuisé »** : le dernier sac a été utilisé.
- **« Palette de pellets livrée »** : une livraison de plusieurs sacs a été enregistrée depuis le widget ou la configuration.

Chaque déclencheur a un champ **Stock** (vide : tous les stocks) et fournit les mêmes chiffres que les actions, plus les **sacs livrés** pour la palette. Exemple : « Stock de pellets bas → m'envoyer "Il reste {{triggerEvent.data.bags_left}} sacs, pensez à commander" ».

Une livraison ajoutée par une scène ne déclenche pas « Palette livrée », pour qu'une scène ne puisse pas se relancer elle-même en boucle. Les déclencheurs de stock bas et épuisé, eux, partent quelle que soit l'origine, y compris un bouton Zigbee passant par une scène.

## Langues

L'intégration parle français, anglais, allemand et espagnol : les widgets et les messages suivent la langue de chaque utilisateur de Gladys. Gladys n'indique pas à une intégration la langue de ses utilisateurs quand elle propose les appareils de l'onglet Découverte : leurs noms suivent le réglage **« Langue des noms d'appareils »** de la configuration (anglais par défaut). Un appareil déjà ajouté garde son nom ; renommez-le depuis ses réglages si vous le souhaitez.

## Sauvegarde

Le registre des mouvements (les 2 000 derniers ; au-delà, les plus anciens sont résumés en gardant le prix des sacs encore en stock) est enregistré dans la base de Gladys : il fait partie des **sauvegardes Gladys** et survit à une mise à jour de l'intégration. Il est supprimé si vous désinstallez l'intégration.
