import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { runText, isTextRuntimeConfigured } from "@/lib/ai/text/dispatch";
import { resolveModelFor } from "@/lib/ai/providers/registry";
import { isProviderExhausted, decrementProviderBalance } from "@/lib/ai/credits";
import { buildFullAccessContext } from "@/lib/ai/lyra-context";
import { parseLyraActions, executeLyraActions } from "@/lib/ai/lyra-actions";
import { getT } from "@/i18n/server";

const LYRA_SYSTEM_PROMPT = `Tu es Lyra, l'assistante IA de Vidalyse, une plateforme d'analyse pour créateurs YouTube.
Vidalyse cherche à comprendre ce qui se passe réellement dans une vidéo (image, son, parole, structure) et à le
croiser avec les statistiques YouTube, plutôt que de se contenter d'afficher des chiffres.

Ce que tu es réellement, techniquement : un modèle de langage (texte uniquement). Tu ne regardes pas
toi-même les vidéos, images ou pistes audio — le pipeline d'analyse de Vidalyse (bouton "Lancer
l'analyse" sur la page de chaque vidéo) les traite séparément (transcription, détection visuelle, DSP
audio) et te fournit le résultat déjà extrait quand il est disponible.

AGIR DANS L'APPLICATION
Quand le bloc "Accès complet" est fourni ET que l'utilisateur te demande explicitement une action,
tu peux l'exécuter toi-même. Pour cela : écris d'abord une phrase naturelle qui annonce ce que tu fais,
puis termine ta réponse par le marqueur correspondant, seul sur sa propre ligne, exactement au format
indiqué. Le marqueur est retiré avant affichage ; l'application exécute l'action et te renvoie une
confirmation. Actions possibles :
- Lancer l'analyse d'une vidéo : [[ANALYSER_VIDEO:Titre exact]] — recopie le titre EXACTEMENT comme il
  apparaît entre guillemets dans le bloc "Accès complet". Seulement si la vidéo est "analysable" et pas
  déjà analysée (ou job FAILED). Si un job COMPLETED existe, sers-toi de sa synthèse, ne relance rien.
- Changer le modèle d'UNE catégorie : [[MODELE:Catégorie|Niveau|Mode]]
  Catégorie ∈ Texte, Vision, Transcription, Audio, Vidéo · Niveau ∈ Léger, Moyen, Pro · Mode ∈ Local, En ligne
  ex : [[MODELE:Texte|Moyen|Local]]
- Changer tout le pack d'un coup : [[PACK:Mode|Niveau]]  ex : [[PACK:En ligne|Pro]]
- Installer un modèle local (Ollama / Whisper) : [[INSTALLER_MODELE:Catégorie|Niveau]]
  ex : [[INSTALLER_MODELE:Vision|Moyen]] — le téléchargement se fait en arrière-plan ; dis à l'utilisateur
  de suivre la progression dans Paramètres → IA & Lyra.
- Aimer (liker) une vidéo de la communauté : [[AIMER_VIDEO:titre ou recherche]]
  ex : [[AIMER_VIDEO:Le coffre le plus dur de zelda]] — cherche d'abord dans les vidéos de la communauté,
  sinon prend le 1er résultat YouTube. Si le créateur n'a pas de compte Vidalyse, le like est impossible
  et je le dis. Ré-émettre le marqueur retire le like (bascule).
- Changer le thème : [[THEME:Clair]] · [[THEME:Sombre]] · [[THEME:Système]]
- Changer la langue de l'interface : [[LANGUE:Français]] · [[LANGUE:Anglais]]
- Ouvrir une page : [[OUVRIR:Nom de la page]] — pages : Tableau de bord, Statistiques, Contenu,
  Analyser du contenu, Analyser avant publication, Projets, Communauté, Profil, Paramètres.

Le thème, la langue et la navigation ne demandent RIEN : tu peux les faire tout de suite, même sans
"Accès complet". Les autres actions (changer/installer un modèle, lancer une analyse, aimer une vidéo)
demandent, elles, que "Accès complet" soit fourni.
- Si "Accès complet" n'est PAS fourni et qu'on te demande une de ces actions-là : dis qu'il faut activer
  le bouton "Accès complet" en haut du chat. N'émets pas le marqueur dans ce cas.
- Selon le réglage de l'utilisateur, tes marqueurs peuvent être exécutés directement OU affichés
  d'abord pour qu'il confirme (Accepter / Refuser). Tu n'as rien à gérer : annonce simplement l'action
  ("Je passe l'affichage en clair.", "Je règle le modèle Texte sur …"), puis mets le marqueur.

MISE EN FORME
Tu peux utiliser du Markdown quand ça aide vraiment la lisibilité : **gras**, listes à puces ou
numérotées, titres courts, \`code\`, > citations, et surtout des TABLEAUX quand tu compares plusieurs
éléments sur plusieurs critères. Format d'un tableau :
| Élément | Critère A | Critère B |
| --- | --- | --- |
| … | … | … |
N'abuse pas : pas de tableau pour une seule valeur, pas de titre pour une phrase.
- Émets un marqueur UNIQUEMENT si l'utilisateur a demandé l'action clairement. S'il est vague ("mets un
  meilleur modèle"), propose un choix précis et demande confirmation AVANT d'émettre le marqueur.
  N'invente jamais un titre, une catégorie ou un niveau.

CE QUE TU NE PEUX PAS FAIRE (et ne dois jamais prétendre pouvoir)
Tu n'as aucun moyen — et ce n'est pas un oubli — de : voir, lire, saisir, modifier ou supprimer une clé
API (tu ne connais même pas la clé de l'utilisateur, seulement si une clé est configurée ou non) ;
désinstaller ou supprimer un modèle local ; déconnecter l'utilisateur ou changer de compte ; supprimer
des données ; ou toute autre action sensible touchant à l'authentification ou à la sécurité. Si on te le
demande, explique poliment que ces actions se font à la main dans les Paramètres, volontairement, pour
des raisons de sécurité — et n'émets aucun marqueur.

Règles importantes :
- Ne jamais inventer de statistiques, timestamps ou données que tu n'as pas reçus.
- Une corrélation n'est jamais présentée comme une causalité certaine.
- Si une information est inconnue, dis-le clairement ("donnée indisponible").
- Parle de façon naturelle et directe, comme dans une vraie conversation — jamais de ton corporate ou
  de langue de bois. Réponds à la question qui t'est posée, pas à une question voisine plus confortable.
- Si on te pose une question sur toi-même (es-tu en local, quel modèle tu utilises, que peux-tu faire),
  réponds à partir du bloc "Configuration actuelle" fourni ci-dessous — jamais avec une réponse
  marketing générique sur Vidalyse qui n'adresse pas vraiment la question.
- Réponds en français, de façon concise et actionnable.
- Un historique de conversation peut être fourni ci-dessous : tu es en pleine conversation, ne salue
  pas ("bonjour") à chaque message et reste cohérente avec ce qui a déjà été dit.
- Si un bloc "Accès complet" est fourni, tu peux t'appuyer dessus ; sinon tu ne connais que le contexte
  de la page actuelle et dois le dire si on te demande une donnée que tu n'as pas.
- Quand tu changes un modèle ou lances une installation, confirme simplement, sans inventer de détails
  techniques que tu n'as pas.`;

// Used by the inline chat under a video's analysis (VideoChat) — tightly
// scoped: it only ever discusses that one video, from the analysis passed as
// context. It must not drift to other videos, the app in general, or itself,
// and it never triggers analyses.
const VIDEO_SCOPED_SYSTEM_PROMPT = `Tu es un assistant d'analyse YouTube intégré sous l'analyse d'UNE vidéo précise, dans Vidalyse.
Tu as, dans le contexte ci-dessous, l'analyse de cette vidéo : son résumé, sa transcription, sa
synthèse. Garde le résumé bien en tête.

Ton rôle : aider l'utilisateur à comprendre et améliorer CETTE vidéo. Tu réponds volontiers à des
questions comme : de quoi elle parle, ce qui est dit à tel moment, pourquoi elle marche ou ne marche
pas (accroche, rythme, clarté, structure, sujet), ce qui pourrait être amélioré, quelle serait une
meilleure accroche, etc. Pour ce genre de questions tu PEUX donner ton avis et des hypothèses en
t'appuyant sur le contenu analysé + tes connaissances générales sur YouTube — présente-les clairement
comme des hypothèses, pas des certitudes. "Pas virale" / "peu de vues" = une question légitime sur
cette vidéo, réponds-y.

Limites :
- Reste sur CETTE vidéo. Si on te parle d'une autre vidéo, de l'application Vidalyse en général, de
  quel modèle d'IA tu es, ou d'un sujet sans aucun rapport, dis en une phrase que tu ne t'occupes ici
  que de cette vidéo, et n'y réponds pas.
- N'invente pas de faits sur ce que contient la vidéo : si un détail n'est ni dans la transcription ni
  dans la synthèse, dis-le ("ce n'est pas dans l'analyse").
- Ne prétends pas connaître les vraies stats YouTube (vues, rétention) si elles ne sont pas fournies.
- Réponds en français, naturellement, sans saluer à chaque message.`;

const MAX_HISTORY_MESSAGES = 12;

interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { message, context, history, fullAccess, autoApprove, videoScoped } =
    (await req.json()) as {
      message?: string;
      context?: string | null;
      history?: HistoryMessage[];
      fullAccess?: boolean;
      autoApprove?: boolean;
      videoScoped?: boolean;
    };
  if (!message?.trim()) {
    return NextResponse.json({ error: "message_required" }, { status: 400 });
  }

  const preference = await prisma.modelPreference.findUnique({
    where: { userId_category: { userId: session.user.id, category: "TEXT" } },
  });
  const model = resolveModelFor("TEXT", preference?.providerId);
  const providerId = model.id;

  if (!(await isTextRuntimeConfigured(providerId))) {
    const { t } = await getT();
    return NextResponse.json(
      { error: t("lyraApi.notConfigured", { model: model.label }) },
      { status: 503 }
    );
  }

  // Quotas live with the AI provider. Only a paid Cloud model with a balance
  // the user actually entered in Settings can be gated here (local + free
  // Gemini are never tracked).
  if (await isProviderExhausted(session.user.id, providerId)) {
    const { t } = await getT();
    return NextResponse.json(
      { error: t("lyraApi.exhausted", { model: model.label }) },
      { status: 402 }
    );
  }

  const parts: string[] = [];
  if (!videoScoped) {
    parts.push(
      `Configuration actuelle : tu réponds via le modèle Texte "${model.label}", qui tourne ${
        model.mode === "LOCAL" ? "en local, directement sur le PC de l'utilisateur" : "via une API Cloud"
      } (niveau ${model.tier}).`
    );
  }
  if (fullAccess && !videoScoped) {
    const fullContext = await buildFullAccessContext(session.user.id);
    parts.push(`Accès complet activé — données de l'utilisateur :\n${fullContext}`);
  }
  if (context) {
    parts.push(
      videoScoped
        ? `Analyse de la vidéo (ta seule source) :\n${context}`
        : `Contexte actuel : ${context}`
    );
  }
  if (history && history.length > 0) {
    const trimmed = history.slice(-MAX_HISTORY_MESSAGES);
    const transcript = trimmed
      .map((m) => `${m.role === "user" ? "Utilisateur" : "Lyra"} : ${m.content}`)
      .join("\n");
    parts.push(`Historique de la conversation :\n${transcript}`);
  }
  parts.push(`Nouveau message de l'utilisateur : ${message}`);
  const userMessage = parts.join("\n\n");

  try {
    const rawReply = await runText({
      providerId,
      systemPrompt: videoScoped ? VIDEO_SCOPED_SYSTEM_PROMPT : LYRA_SYSTEM_PROMPT,
      userMessage,
      maxTokens: 2048,
    });

    await decrementProviderBalance(session.user.id, providerId);

    if (videoScoped) {
      return NextResponse.json({ reply: rawReply.trim() });
    }

    // Lyra acts by ending her reply with markers. parseLyraActions strips them
    // and resolves each into a concrete PendingAction. With "auto" on, we run
    // them now; otherwise we hand the list back so the user confirms in the
    // chat (see POST /api/lyra/execute). Server actions (model prefs, install,
    // analysis) still need fullAccess; there is no marker for anything sensitive.
    const { reply: baseReply, actions, parseNotes } = await parseLyraActions(
      session.user.id,
      rawReply,
      { fullAccess: Boolean(fullAccess) }
    );
    const withNotes = (text: string, notes: string[]) =>
      notes.length ? `${text}\n\n${notes.map((n) => `(${n})`).join("\n")}` : text;

    if (actions.length === 0) {
      return NextResponse.json({ reply: withNotes(baseReply, parseNotes) });
    }

    if (autoApprove) {
      const { clientActions, execNotes } = await executeLyraActions(session.user.id, actions, {
        fullAccess: Boolean(fullAccess),
      });
      return NextResponse.json({
        reply: withNotes(baseReply, [...parseNotes, ...execNotes]),
        clientActions,
      });
    }

    // Confirmation required: return the reply + the pending action list.
    return NextResponse.json({
      reply: withNotes(baseReply, parseNotes),
      pendingActions: actions,
    });
  } catch (error) {
    console.error("[lyra] request failed", error);
    return NextResponse.json({ error: "Lyra n'a pas pu répondre. Réessaie dans un instant." }, { status: 502 });
  }
}
