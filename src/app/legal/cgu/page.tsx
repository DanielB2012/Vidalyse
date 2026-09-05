import Link from "next/link";
import { ArrowLeft } from "lucide-react";

// Legal prose stays French-only by design — see the comment in
// ../mentions-legales/page.tsx.
export default function CguPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-10 text-sm leading-relaxed">
      <Link href="/settings" className="flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
        <ArrowLeft size={15} />
        Retour
      </Link>

      <h1 className="text-xl font-semibold tracking-tight">Conditions générales d’utilisation</h1>
      <p className="text-muted">
        En créant un compte Vidalyse, tu acceptes les conditions ci-dessous.
        Voir aussi la <Link href="/legal/confidentialite" className="text-accent hover:underline">Politique de confidentialité</Link>.
      </p>

      <section className="space-y-2">
        <h2 className="font-semibold">1. Objet</h2>
        <p className="text-muted">
          Vidalyse est un service d’analyse de contenu vidéo pour créateurs
          YouTube : traitement technique (image, son, parole, structure) mis
          en regard des statistiques YouTube du créateur, assistance IA
          (Lyra), et fonctionnalités communautaires optionnelles (profil
          public, publication de vidéos, messagerie privée).
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">2. Compte et connexion Google</h2>
        <p className="text-muted">
          L’accès se fait via un compte Google. Tu es responsable de la
          confidentialité de tes identifiants. Vidalyse n’accède à YouTube
          qu’en lecture seule : rien n’est jamais publié, modifié ou
          supprimé sur ta chaîne sans action explicite de ta part.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">3. Contenu que tu publies ou envoies</h2>
        <p className="text-muted">
          Tu restes seul responsable des vidéos que tu importes, du profil
          public que tu crées, des vidéos que tu publies dans la Communauté
          et des messages privés que tu envoies. Tu t’engages à ne pas
          publier ou transmettre de contenu illicite, diffamatoire,
          harcelant, ou portant atteinte aux droits d’un tiers.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">4. Communauté, blocage et signalement</h2>
        <p className="text-muted">
          Le profil public, la publication de vidéos et la messagerie privée
          sont optionnels et désactivables. Tu peux à tout moment bloquer un
          autre profil (il ne pourra plus te suivre ni t’écrire) et signaler
          un profil, une vidéo ou un message qui te semble abusif. Tout
          compte utilisé pour harceler, usurper une identité ou publier du
          contenu manifestement illicite pourra être suspendu.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">5. Analyses et suggestions de l’IA</h2>
        <p className="text-muted">
          Les analyses, résumés et suggestions produits par Vidalyse
          (transcription, détection visuelle, synthèse, chat avec Lyra) sont
          générés par des modèles d’intelligence artificielle à titre
          indicatif. Ils peuvent contenir des erreurs ou des approximations
          et ne remplacent pas ton propre jugement éditorial.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">6. Modèles et coûts tiers</h2>
        <p className="text-muted">
          Certaines fonctionnalités d’analyse en ligne nécessitent que tu
          fournisses ta propre clé API (Google Gemini). Les coûts éventuels
          associés à cette clé relèvent de ta relation avec ce fournisseur,
          pas de Vidalyse.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">7. Résiliation</h2>
        <p className="text-muted">
          Tu peux supprimer ton compte et toutes les données associées à tout
          moment depuis Paramètres → Zone dangereuse. [Nom de l’éditeur] peut
          suspendre ou supprimer un compte en cas de violation de ces
          conditions.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">8. Limitation de responsabilité</h2>
        <p className="text-muted">
          Le service est fourni « en l’état ». [Nom de l’éditeur] ne garantit
          pas une disponibilité continue ni l’absence totale d’erreur dans
          les analyses, et ne saurait être tenu responsable des décisions
          éditoriales prises sur la base des suggestions de l’IA.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">9. Contact</h2>
        <p className="text-muted">
          Pour toute question sur ces conditions : [adresse e-mail de
          contact].
        </p>
        <p className="text-xs text-muted">Dernière mise à jour : [date].</p>
      </section>
    </div>
  );
}
