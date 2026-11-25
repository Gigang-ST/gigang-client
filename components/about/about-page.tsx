import Image from "next/image";
import Link from "next/link";
import { Fragment } from "react";

import { AboutArchiveGrid } from "@/components/about/about-archive-grid";
import {
  ABOUT_ARCHIVE,
  ABOUT_EVENTS,
  ABOUT_FOOTER,
  ABOUT_HERO,
  ABOUT_JOIN,
  ABOUT_NAV_LINKS,
  ABOUT_PHOTO,
  ABOUT_SPIRIT,
  ABOUT_STORY,
  ABOUT_WHAT,
  PENDING_TIMELINE,
} from "@/lib/about/content";

/** 문장마다 줄을 바꿔 보여 준다. */
function Lines({ lines }: { lines: readonly string[] }) {
  return (
    <>
      {lines.map((line, i) => (
        <Fragment key={line}>
          {i > 0 && <br />}
          {line}
        </Fragment>
      ))}
    </>
  );
}

/**
 * 사진 한 장. Vercel 이미지 최적화(Hobby 월 한도, AGENTS.md §Vercel 사용량)를 쓰지 않는다 —
 * 소개 페이지 사진은 정적 파일이라 변환 호출을 한 번도 늘리지 않게 `unoptimized`로 그대로 낸다.
 */
function Photo({ src, alt, sizes, position, className }: {
  src: string;
  alt: string;
  sizes: string;
  position?: string;
  className?: string;
}) {
  return (
    <div className={`ab-photo ${className ?? ""}`}>
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        unoptimized
        style={position ? { objectPosition: position } : undefined}
      />
    </div>
  );
}

function Tag({ children }: { children: string }) {
  return <div className="ab-tag">{children}</div>;
}

/** 기강 소개 페이지 본문 — 글·사진은 `lib/about/content.ts`에서만 가져온다. */
export function AboutPage() {
  const hero = ABOUT_HERO;
  const tickerLoop = [...hero.ticker, ...hero.ticker];

  return (
    <div className="about-scope app-full">
      <nav className="ab-nav">
        <div className="ab-wrap">
          <b>GIGANG</b>
          <div className="links">
            {ABOUT_NAV_LINKS.map((l) => (
              <a key={l.href} href={l.href}>{l.label}</a>
            ))}
          </div>
          <a className="ab-btn" href="#join">함께하기</a>
        </div>
      </nav>

      <header className="ab-hero">
        <div className="ab-hero-bg" aria-hidden>
          <Image src={ABOUT_PHOTO.hero} alt="" fill sizes="100vw" unoptimized priority />
        </div>
        <div className="ab-wrap">
          <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "flex-end" }}>
            <Image className="ab-logo" src="/logo_white.webp" alt="기강 로고" width={84} height={84} unoptimized />
            <div className="ab-sl">{hero.slogan}</div>
            <h1 className="ab-h1">
              {hero.titleTop}
              <br />
              <em>{hero.titleEm}</em>
              {hero.titleEnd}
            </h1>
            <p className="ab-lead">
              {hero.lead}
              <span>{hero.leadSub}</span>
            </p>
            <div>
              <a className="ab-cta" href="#join">함께하기</a>
              <a className="ab-cta ghost" href="#story">STORY</a>
            </div>
          </div>
          <div className="ab-hero-side">
            <Photo src={ABOUT_PHOTO.hero} alt={hero.photoAlt} sizes="(min-width: 1000px) 560px, 0px" className="ab-hero-photo" />
          </div>
        </div>
      </header>

      <div className="ab-ticker" aria-hidden>
        <span>
          {tickerLoop.map((t, i) => (
            <Fragment key={`${t}-${i}`}>
              {t}
              <b>●</b>
            </Fragment>
          ))}
        </span>
      </div>

      <section className="ab-section" id="story">
        <div className="ab-wrap ab-story">
          <div>
            <Tag>{ABOUT_STORY.tag}</Tag>
            <h2 className="ab-h2"><Lines lines={ABOUT_STORY.title} /></h2>
            {ABOUT_STORY.paragraphs.map((p) => (
              <p key={p[0]}><Lines lines={p} /></p>
            ))}
            <p className="strong"><Lines lines={ABOUT_STORY.strong} /></p>
            <ol className="ab-tl">
              {PENDING_TIMELINE.map((t) => (
                <li key={t.when}>
                  <small>{t.when}</small>
                  <b>{t.title}</b>
                  <span>{t.text}</span>
                </li>
              ))}
            </ol>
          </div>
          <Photo src={ABOUT_PHOTO.story} alt={ABOUT_STORY.photoAlt} sizes="(min-width: 1000px) 440px, 100vw" position="center 45%" className="ab-story-photo" />
        </div>
      </section>

      <section className="ab-section" id="what">
        <div className="ab-wrap">
          <Tag>{ABOUT_WHAT.tag}</Tag>
          <h2 className="ab-h2"><Lines lines={ABOUT_WHAT.title} /></h2>
          <p><Lines lines={ABOUT_WHAT.lead} /></p>
          <div className="ab-cards">
            {ABOUT_WHAT.cards.map((c) => (
              <article className="ab-card" key={c.key}>
                <div className="ab-card-vis">
                  <Image className="ph" src={c.photo} alt={c.photoAlt} fill sizes="(min-width: 1200px) 280px, (min-width: 760px) 50vw, 100vw" unoptimized style={{ objectPosition: c.position }} />
                  {c.label && <span className="ab-card-lab">{c.label}</span>}
                </div>
                <div className="ab-card-body">
                  <h3>{c.name}</h3>
                  <div className="en">{c.en}</div>
                  {c.body.map((p) => (
                    <p key={p[0]}><Lines lines={p} /></p>
                  ))}
                  <div className="get">
                    {c.getBold && <b>{c.getBold}</b>}
                    {c.getRest}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="ab-section ab-spirit" id="spirit">
        <div className="ab-wrap ab-spirit-cols">
          <div>
            <Tag>{ABOUT_SPIRIT.tag}</Tag>
            <h2 className="ab-h2"><Lines lines={ABOUT_SPIRIT.title} /></h2>
            <div className="ab-bar" />
          </div>
          <div>
            <div className="ab-q">
              {ABOUT_SPIRIT.quotes.map((q) => (
                <span key={q}>{q}</span>
              ))}
            </div>
            {ABOUT_SPIRIT.paragraphs.map((p) => (
              <p key={p[0]}><Lines lines={p} /></p>
            ))}
          </div>
        </div>
      </section>

      <section className="ab-section" id="events">
        <div className="ab-wrap">
          <Tag>{ABOUT_EVENTS.tag}</Tag>
          <h2 className="ab-h2">{ABOUT_EVENTS.title}</h2>
          <p>{ABOUT_EVENTS.lead}</p>
          <div className="ab-evs">
            {ABOUT_EVENTS.items.map((e) => (
              <div className="ab-ev" key={e.kicker}>
                <small>{e.kicker}</small>
                <h3>{e.name}</h3>
                <p><Lines lines={e.body} /></p>
                <Photo src={e.photo} alt={e.photoAlt} sizes="(min-width: 1000px) 560px, 100vw" className="ab-ev-photo" />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="ab-section" id="join">
        <div className="ab-wrap ab-join">
          <div>
            <Tag>{ABOUT_JOIN.tag}</Tag>
            <h2 className="ab-h2">{ABOUT_JOIN.title}</h2>
            <ol className="ab-steps">
              {ABOUT_JOIN.steps.map((s) => (
                <li key={s.main}>
                  <div>
                    {s.main}
                    <small>{s.sub}</small>
                  </div>
                </li>
              ))}
            </ol>
            <Link className="ab-cta" href={ABOUT_JOIN.cta.href}>{ABOUT_JOIN.cta.label}</Link>
          </div>
          <div style={{ paddingTop: 8 }}>
            <p>{ABOUT_JOIN.contact}</p>
            <p>
              <a href={ABOUT_JOIN.instagram.href} target="_blank" rel="noopener noreferrer" style={{ color: "#fff", fontWeight: 700 }}>
                {ABOUT_JOIN.instagram.handle}
              </a>
            </p>
            <p className="ab-join-note"><Lines lines={ABOUT_JOIN.note} /></p>
          </div>
        </div>
      </section>

      <section className="ab-section" id="archive">
        <div className="ab-wrap">
          <Tag>{ABOUT_ARCHIVE.tag}</Tag>
          <h2 className="ab-h2">{ABOUT_ARCHIVE.title}</h2>
          <p>{ABOUT_ARCHIVE.lead}</p>
          <AboutArchiveGrid photos={ABOUT_ARCHIVE.photos} />
        </div>
      </section>

      <footer className="ab-footer">
        <Image src="/logo_white.webp" alt="" width={44} height={44} unoptimized />
        <div className="lets">{ABOUT_FOOTER.lets}</div>
        <div>{ABOUT_FOOTER.sub}</div>
      </footer>
    </div>
  );
}
