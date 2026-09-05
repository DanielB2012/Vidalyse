import Link from "next/link";
import { ArrowLeft } from "lucide-react";

// Legal prose stays French-only by design — see the comment in
// ../mentions-legales/page.tsx. Content here reflects what the codebase
// ACTUALLY does (checked against src/auth.config.ts, src/lib/messages/dm.ts,
// src/lib/community/*, src/app/api/report-error, src/lib/ai/gemini-key.ts)
// rather than generic boilerplate — keep it that way when the app’s data
// flows change. [Bracketed] fields are placeholders to fill in before going
// live (contact address, data controller identity, host).
export default function ConfidentialitePage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-10 text-sm leading-relaxed">
      <Link href="/settings" className="flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
        <ArrowLeft size={15} />
        Retour
      </Link>

      <h1 className="text-xl font-semibold tracking-tight">Politique de confidentialité</h1>
      <p className="text-muted">
        Cette page décrit quelles données Vidalyse traite, pourquoi, et
        comment les contrôler. Le responsable de traitement est [Nom de
        l’éditeur — voir les Mentions légales].
      </p>

      <section className="space-y-2">
        <h2 className="font-semibold">Données collectées</h2>
        <ul className="list-disc space-y-1.5 pl-5 text-muted">
          <li>
            <strong className="text-foreground">Compte Google :</strong> nom, adresse e-mail,
            photo de profil, via la connexion OAuth Google.
          </li>
          <li>
            <strong className="text-foreground">Données YouTube :</strong> informations de ta
            chaîne et statistiques (vues, abonnés, performances vidéo) en
            lecture seule, via les scopes Google <code>youtube.readonly</code>{" "}
            et <code>yt-analytics.readonly</code>. Vidalyse ne peut rien
            publier, modifier ni supprimer sur YouTube en ton nom.
          </li>
          <li>
            <strong className="text-foreground">Vidéos que tu importes :</strong> stockées sur le
            serveur pour être analysées (transcription, détection visuelle,
            analyse audio). Elles ne sont jamais partagées avec d’autres
            utilisateurs sauf si tu choisis explicitement de les publier dans
            la Communauté.
          </li>
          <li>
            <strong className="text-foreground">Profil communautaire :</strong> optionnel — un
            pseudo (@handle), un nom d’affichage, une bio et un avatar que tu
            choisis de rendre publics.
          </li>
          <li>
            <strong className="text-foreground">Messages privés :</strong> le contenu des messages
            que tu échanges avec d’autres profils Vidalyse est stocké pour te
            permettre de retrouver l’historique de tes conversations.
          </li>
          <li>
            <strong className="text-foreground">Clé API Gemini (facultatif) :</strong> si tu colles
            ta propre clé Google Gemini dans Paramètres, elle est stockée
            pour déclencher tes propres appels vers l’API Gemini — elle
            n’est jamais utilisée pour un autre compte que le tien ni
            partagée avec qui que ce soit.
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Analyse locale (modèles installés en local)</h2>
        <p className="text-muted">
          Quand tu choisis un modèle « local » (Ollama, Whisper) dans
          Paramètres, l’analyse tourne entièrement sur ta machine ou ton
          serveur — rien n’est envoyé à un service tiers dans ce mode.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Destinataires des données</h2>
        <ul className="list-disc space-y-1.5 pl-5 text-muted">
          <li>
            <strong className="text-foreground">Google</strong> : authentification, lecture des
            données YouTube, et — uniquement si tu as configuré une clé —
            appels à l’API Gemini pour l’analyse IA et l’assistante Lyra.
          </li>
          <li>
            <strong className="text-foreground">Discord</strong> : si tu envoies un rapport de bug
            depuis l’app, seuls le titre, la description et ton pseudo
            YouTube sont transmis à un salon Discord de l’éditeur — jamais
            ton adresse e-mail.
          </li>
          <li>
            <strong className="text-foreground">Hébergeur</strong> : [Nom de l’hébergeur — voir les
            Mentions légales], qui héberge le serveur et la base de données.
          </li>
        </ul>
        <p className="text-muted">
          Vidalyse ne vend ni ne partage tes données à des fins publicitaires.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Données YouTube : engagement spécifique</h2>
        <p className="text-muted">
          Conformément à la politique de Google pour les API YouTube, les
          données lues via l’API YouTube ne sont utilisées que pour les
          fonctionnalités décrites ici (statistiques, analyse de contenu) —
          jamais pour de la publicité, ni transmises à un tiers non
          mentionné, ni utilisées pour entraîner un modèle d’IA généraliste.
          Si tu déconnectes ton compte Google ou retires une chaîne liée
          (Paramètres → Comptes connectés), les données mises en cache
          associées sont supprimées.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Cookies</h2>
        <p className="text-muted">
          Vidalyse n’utilise aucun cookie publicitaire ou de mesure d’audience
          tiers. Seuls des cookies strictement nécessaires sont posés : la
          session de connexion et ta préférence de langue/thème.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Durée de conservation</h2>
        <p className="text-muted">
          Tes données sont conservées tant que ton compte existe. Tu peux les
          supprimer intégralement à tout moment depuis Paramètres → Zone
          dangereuse → Supprimer mon compte.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Tes droits</h2>
        <p className="text-muted">
          Conformément au RGPD, tu disposes d’un droit d’accès, de
          rectification, d’effacement, de limitation et de portabilité de tes
          données. L’effacement est disponible directement dans l’app
          (Paramètres → Zone dangereuse) ; pour les autres demandes, écris à
          [adresse e-mail de contact]. Tu peux aussi introduire une
          réclamation auprès de la CNIL (cnil.fr).
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Modération</h2>
        <p className="text-muted">
          Tu peux bloquer un profil (il ne pourra plus te suivre ni
          t’écrire) et signaler un profil, une vidéo ou un message via les
          boutons dédiés dans l’app.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Modifications</h2>
        <p className="text-muted">
          Cette politique peut évoluer avec les fonctionnalités de l’app ; la
          date de dernière mise à jour figure ci-dessous.
        </p>
        <p className="text-xs text-muted">Dernière mise à jour : [date].</p>
      </section>
    </div>
  );
}
