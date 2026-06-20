/**
 * Browserless CV PDF renderer (@react-pdf/renderer) — no headless browser.
 * Renders the already-structured tailored CV into a classic black-on-white
 * ATS document: centered uppercase name, "|"-separated contact row, uppercase
 * underlined section titles. Uses built-in Helvetica (no font files to ship).
 */
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { TailoredCv } from "./schema";

export interface CvHeaderInfo {
  name: string;
  label?: string;
  email?: string | null;
  phone?: string | null;
  linkedinUrl?: string | null;
  portfolioUrl?: string | null;
  githubUrl?: string | null;
  location?: string | null;
}

function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

const styles = StyleSheet.create({
  page: {
    paddingVertical: 40,
    paddingHorizontal: 44,
    fontFamily: "Helvetica",
    fontSize: 9.5,
    color: "#1a1a1a",
    lineHeight: 1.4,
  },
  name: {
    fontFamily: "Helvetica-Bold",
    fontSize: 20,
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  label: { fontSize: 10.5, textAlign: "center", marginTop: 3, color: "#333" },
  contact: { fontSize: 8.5, textAlign: "center", marginTop: 5, color: "#444" },
  section: { marginTop: 13 },
  h2: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    borderBottomWidth: 1,
    borderBottomColor: "#222",
    paddingBottom: 2,
    marginBottom: 6,
  },
  entry: { marginBottom: 8 },
  row: { flexDirection: "row", justifyContent: "space-between" },
  org: { fontFamily: "Helvetica-Bold" },
  when: { color: "#555", fontSize: 9 },
  role: { fontFamily: "Helvetica-Oblique", marginTop: 1, marginBottom: 3 },
  bulletRow: { flexDirection: "row", marginBottom: 2 },
  bulletDot: { width: 11 },
  bulletText: { flex: 1 },
  bold: { fontFamily: "Helvetica-Bold" },
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section} wrap={false}>
      <Text style={styles.h2}>{title}</Text>
      {children}
    </View>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.bulletRow}>
      <Text style={styles.bulletDot}>•</Text>
      <Text style={styles.bulletText}>{children}</Text>
    </View>
  );
}

function CvDocument({ header, cv }: { header: CvHeaderInfo; cv: TailoredCv }) {
  const contact = [
    header.location,
    header.phone,
    header.email,
    header.portfolioUrl && displayUrl(header.portfolioUrl),
    header.githubUrl && displayUrl(header.githubUrl),
    header.linkedinUrl && displayUrl(header.linkedinUrl),
  ]
    .filter(Boolean)
    .join("   |   ");

  return (
    <Document
      title={`${header.name} — CV`}
      author={header.name}
      creator="CVSparkz"
    >
      <Page size={cv.paper_format === "letter" ? "LETTER" : "A4"} style={styles.page}>
        {/* Header */}
        <Text style={styles.name}>{header.name}</Text>
        {header.label ? <Text style={styles.label}>{header.label}</Text> : null}
        {contact ? <Text style={styles.contact}>{contact}</Text> : null}

        {cv.summary?.trim() ? (
          <Section title="Professional Summary">
            <Text>{cv.summary}</Text>
          </Section>
        ) : null}

        {cv.competencies.length > 0 ? (
          <Section title="Core Competencies">
            <Text>{cv.competencies.join("   ·   ")}</Text>
          </Section>
        ) : null}

        {cv.experience.length > 0 ? (
          <Section title="Experience">
            {cv.experience.map((e, i) => (
              <View key={i} style={styles.entry} wrap={false}>
                <View style={styles.row}>
                  <Text style={styles.org}>{e.company}</Text>
                  <Text style={styles.when}>{e.period}</Text>
                </View>
                <Text style={styles.role}>
                  {e.role}
                  {e.location ? `  ·  ${e.location}` : ""}
                </Text>
                {e.bullets.map((b, j) => (
                  <Bullet key={j}>{b}</Bullet>
                ))}
              </View>
            ))}
          </Section>
        ) : null}

        {cv.skills.length > 0 ? (
          <Section title="Technical Skills">
            {cv.skills.map((s, i) => (
              <Text key={i} style={{ marginBottom: 1.5 }}>
                <Text style={styles.bold}>{s.category}: </Text>
                {s.items}
              </Text>
            ))}
          </Section>
        ) : null}

        {cv.projects.length > 0 ? (
          <Section title="Projects">
            {cv.projects.map((p, i) => (
              <View key={i} style={{ marginBottom: 5 }}>
                <Text>
                  <Text style={styles.bold}>{p.title}</Text>
                  {p.tech ? `  ·  ${p.tech}` : ""}
                </Text>
                <Text>{p.description}</Text>
              </View>
            ))}
          </Section>
        ) : null}

        {cv.education.length > 0 ? (
          <Section title="Education">
            {cv.education.map((ed, i) => (
              <View key={i} style={{ marginBottom: 4 }}>
                <View style={styles.row}>
                  <Text>
                    <Text style={styles.bold}>{ed.title}</Text>
                    {ed.org ? ` — ${ed.org}` : ""}
                  </Text>
                  {ed.year ? <Text style={styles.when}>{ed.year}</Text> : null}
                </View>
                {ed.desc ? <Text style={{ color: "#555" }}>{ed.desc}</Text> : null}
              </View>
            ))}
          </Section>
        ) : null}

        {cv.certifications.length > 0 ? (
          <Section title="Certifications">
            {cv.certifications.map((c, i) => (
              <View key={i} style={styles.row}>
                <Text>
                  <Text style={styles.bold}>{c.title}</Text>
                  {c.org ? ` — ${c.org}` : ""}
                </Text>
                {c.year ? <Text style={styles.when}>{c.year}</Text> : null}
              </View>
            ))}
          </Section>
        ) : null}
      </Page>
    </Document>
  );
}

export async function renderCvPdf(
  header: CvHeaderInfo,
  cv: TailoredCv
): Promise<Buffer> {
  return renderToBuffer(<CvDocument header={header} cv={cv} />);
}
