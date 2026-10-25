import { useNavigate } from "react-router-dom";
import { useLanguage } from "../LanguageContext.jsx";
import { privacy } from "../legal/privacy.js";
import { terms } from "../legal/terms.js";

/* The privacy policy and the terms of use, which are the same page with
   different words in it.

   Open without signing in, on purpose: Google checks them before it will let
   anyone outside a test list sign in, and somebody deciding whether to join
   has to be able to read them before they have an account. */

const DOCS = { privacy, terms };

export default function LegalPage({ doc }) {
  const { language } = useLanguage();
  const navigate = useNavigate();
  const content = DOCS[doc][language === "en" ? "en" : "he"];
  const back = language === "en" ? "Back" : "חזרה";

  return (
    <div className="legal">
      <button type="button" className="legal-back" onClick={() => navigate(-1)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M19 12H5M11 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {back}
      </button>

      <h1 className="legal-title">{content.title}</h1>
      <p className="legal-updated">{content.updated}</p>
      <p className="legal-intro">{content.intro}</p>

      {content.sections.map((section) => (
        <section className="legal-section" key={section.h}>
          <h2 className="legal-h">{section.h}</h2>
          {section.p?.map((line) => (
            <p className="legal-p" key={line}>
              {line}
            </p>
          ))}
          {section.list && (
            <ul className="legal-list">
              {section.list.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
          {section.after?.map((line) => (
            <p className="legal-p" key={line}>
              {line}
            </p>
          ))}
        </section>
      ))}
    </div>
  );
}
