import Link from "next/link";
import { ArrowLeft } from "lucide-react";

// Legal prose stays French-only by design (same rationale as the Lyra system
// prompts and analysis-engine text — see memory "i18n-fr-en"): Vidalyse’s
// primary market is French, and a naive mirrored English translation of legal
// text would itself carry legal risk without a real review. Only the site
// chrome (nav links, page titles) goes through src/i18n.
//
// PLACEHOLDERS: every [bracketed] field must be filled in with real, accurate
// information before this page is shown to real users — required by French
// law (LCEN art. 6-III) to identify who publishes the site.
export default function MentionsLegalesPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-10 text-sm leading-relaxed">
      <Link href="/settings" className="flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
        <ArrowLeft size={15} />
        Retour
      </Link>

      <h1 className="text-xl font-semibold tracking-tight">Mentions légales</h1>

      <section className="space-y-2">
        <h2 className="font-semibold">Éditeur du site</h2>
        <p className="text-muted">
          [Nom de l’éditeur — personne physique ou raison sociale]
          <br />
          [Statut : entreprise individuelle / société — SIRET si applicable]
          <br />
          [Adresse postale]
          <br />
          Contact : [adresse e-mail de contact]
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Directeur de la publication</h2>
        <p className="text-muted">[Nom du directeur de la publication]</p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Hébergement</h2>
        <p className="text-muted">
          [Nom de l’hébergeur]
          <br />
          [Adresse de l’hébergeur]
          <br />
          [Contact de l’hébergeur]
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Propriété intellectuelle</h2>
        <p className="text-muted">
          Le nom « Vidalyse », son logo et l’ensemble des éléments graphiques et
          textuels du site sont la propriété de l’éditeur, sauf mention contraire.
          Toute reproduction sans autorisation est interdite.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Signaler un contenu</h2>
        <p className="text-muted">
          Pour signaler un contenu manifestement illicite (profil, vidéo ou
          message privé), utilise le bouton « Signaler » présent sur le
          contenu concerné, ou écris à [adresse e-mail de contact].
        </p>
      </section>
    </div>
  );
}
