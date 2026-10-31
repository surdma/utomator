import type { CareerDocument, Resume } from './types';

export default function ResumePaper({
  value,
  template,
}: {
  value: CareerDocument;
  template: Resume['template'];
}) {
  return (
    <article
      className={`career-print-area career-paper career-paper--${template}`}
      data-testid="career-preview"
      aria-label="Live résumé preview"
    >
      <header className="career-paper-header">
        <div className="career-monogram" aria-hidden>
          {value.name
            .trim()
            .split(/\s+/)
            .map((p) => p[0])
            .slice(0, 2)
            .join('')
            .toUpperCase()}
        </div>
        <div>
          <h2>{value.name || 'Your name'}</h2>
          <p className="career-paper-headline">
            {value.headline || 'Professional headline'}
          </p>
          {value.location && (
            <p className="career-paper-location">{value.location}</p>
          )}
        </div>
      </header>
      <div className="career-paper-body">
        <aside className="career-paper-side">
          {value.contacts.length > 0 && (
            <section>
              <h3>Contact</h3>
              {value.contacts.filter(Boolean).map((c, i) => (
                <p key={i} className="career-paper-contact">
                  {c}
                </p>
              ))}
            </section>
          )}
          {value.skills.length > 0 && (
            <section>
              <h3>Core skills</h3>
              <ul className="career-paper-skill-list">
                {value.skills.filter(Boolean).map((skill, i) => (
                  <li key={i}>{skill}</li>
                ))}
              </ul>
            </section>
          )}
          {value.education.length > 0 && (
            <section>
              <h3>Education</h3>
              {value.education.map((edu, i) => (
                <div className="career-paper-entry" key={i}>
                  <strong>{edu.institution}</strong>
                  <p>{edu.degree}</p>
                </div>
              ))}
            </section>
          )}
        </aside>
        <div className="career-paper-main">
          {value.summary && (
            <section>
              <h3>Professional summary</h3>
              <p>{value.summary}</p>
            </section>
          )}
          {value.experience.length > 0 && (
            <section>
              <h3>Experience</h3>
              {value.experience.map((job, i) => (
                <div className="career-paper-entry" key={i}>
                  <div className="career-paper-job">
                    <strong>{job.role || 'Job title'}</strong>
                    <span>{job.period}</span>
                  </div>
                  <p className="career-paper-company">
                    {job.company}
                    {job.location && ` · ${job.location}`}
                  </p>
                  {job.bullets.some(Boolean) && (
                    <ul>
                      {job.bullets.filter(Boolean).map((bullet, j) => (
                        <li key={j}>{bullet}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </section>
          )}
          {value.projects.length > 0 && (
            <section>
              <h3>Selected projects</h3>
              {value.projects.map((p, i) => (
                <div className="career-paper-entry" key={i}>
                  <strong>{p.title}</strong>
                  <p>{p.outcome}</p>
                </div>
              ))}
            </section>
          )}
        </div>
      </div>
      {value.customSections.length > 0 && (
        <div className="career-paper-extras">
          {value.customSections.map((s) => (
            <section key={s.id}>
              <h3>{s.title}</h3>
              <ul>
                {s.items.filter(Boolean).map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </article>
  );
}
