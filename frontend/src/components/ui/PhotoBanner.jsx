/**
 * Page heading set over a wide photo. The photo is decorative (the heading carries the meaning),
 * sits behind a theme-aware scrim so text keeps AA contrast, and is loaded eagerly because it is
 * above the fold.
 */
export function PhotoBanner({ photo, title, sub, children }) {
  return (
    <header className="banner">
      <img
        className="banner__img"
        src={photo.src}
        width={photo.width}
        height={photo.height}
        alt={photo.alt}
        fetchPriority="high"
        decoding="async"
      />
      <div className="banner__scrim" aria-hidden="true" />
      <div className="banner__content">
        <h1 className="page-title banner__title">{title}</h1>
        {sub && <p className="page-sub banner__sub">{sub}</p>}
        {children}
      </div>
    </header>
  );
}
