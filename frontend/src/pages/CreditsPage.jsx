import { Link } from 'react-router-dom';
import { ArrowLeft } from '@phosphor-icons/react';
import { PHOTOS, PHOTO_CREDITS } from '../assets/photos';

const byCredit = Object.fromEntries(Object.values(PHOTOS).map((p) => [p.credit, p]));

/** Attribution for the photographs, as their licences require. Public so login can link to it. */
export function CreditsPage() {
  return (
    <main id="main" className="credits-page shell--ground">
      <div className="credits">
        <Link to="/" className="btn btn-ghost back">
          <ArrowLeft size={16} aria-hidden="true" />
          Back
        </Link>
        <div>
          <h1 className="page-title">Photo credits</h1>
          <p className="page-sub">
            Photos from Wikimedia Commons, cropped and compressed for this app. Adapted versions are shared under the
            same licence.
          </p>
        </div>
        <ul className="credits__list">
          {PHOTO_CREDITS.map((c) => (
            <li key={c.key} className="credits__item">
              <img src={byCredit[c.key].src} alt="" width={112} height={72} loading="lazy" />
              <p>
                <strong>{c.use}</strong>
                <a href={c.source} target="_blank" rel="noreferrer">
                  {c.title}
                </a>{' '}
                by {c.author},{' '}
                <a href={c.licenseUrl} target="_blank" rel="noreferrer">
                  {c.license}
                </a>
              </p>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
