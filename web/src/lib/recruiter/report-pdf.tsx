import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { HiringReport, Decision } from "./interview";

export interface ReportMeta {
  candidate: string;
  position: string;
  interviewer: string | null;
  interviewDate: string | null;
  reportDate: string;
  stage: string;
}

const DECISION_COLOR: Record<Decision, string> = {
  strong_hire: "#047857",
  hire: "#0f766e",
  conditional_hire: "#b45309",
  no_hire: "#be123c",
};

const styles = StyleSheet.create({
  page: {
    paddingVertical: 44,
    paddingHorizontal: 48,
    fontFamily: "Helvetica",
    fontSize: 9.5,
    color: "#1a1a1a",
    lineHeight: 1.45,
  },
  kicker: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 2,
    color: "#6b7280",
    textTransform: "uppercase",
  },
  title: { fontFamily: "Helvetica-Bold", fontSize: 19, marginTop: 4 },
  meta: { fontSize: 8.5, color: "#555", marginTop: 4 },
  verdictBox: {
    marginTop: 14,
    borderLeftWidth: 4,
    paddingLeft: 10,
    paddingVertical: 4,
  },
  verdictLabel: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  verdictText: { fontFamily: "Helvetica-Bold", fontSize: 12, marginTop: 2 },
  h2: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    borderBottomWidth: 1,
    borderBottomColor: "#222",
    paddingBottom: 2,
    marginTop: 16,
    marginBottom: 6,
  },
  row: { flexDirection: "row" },
  scHead: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#d1d5db",
    paddingBottom: 3,
    marginBottom: 3,
  },
  scRow: {
    flexDirection: "row",
    paddingVertical: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: "#eee",
  },
  scDim: { width: "32%", fontFamily: "Helvetica-Bold", paddingRight: 6 },
  scScore: { width: "12%" },
  scNote: { width: "56%", color: "#374151" },
  th: { fontFamily: "Helvetica-Bold", fontSize: 8.5, color: "#6b7280" },
  itemTitle: { fontFamily: "Helvetica-Bold" },
  bulletRow: { flexDirection: "row", marginBottom: 3 },
  bulletDot: { width: 11 },
  bulletText: { flex: 1 },
  block: { marginBottom: 6 },
});

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.bulletRow}>
      <Text style={styles.bulletDot}>•</Text>
      <Text style={styles.bulletText}>{children}</Text>
    </View>
  );
}

function ReportDoc({
  report,
  meta,
}: {
  report: HiringReport;
  meta: ReportMeta;
}) {
  const color = DECISION_COLOR[report.decision] ?? "#374151";
  return (
    <Document title={`Hiring Decision — ${meta.candidate}`} creator="CVSparkz">
      <Page size="A4" style={styles.page}>
        <Text style={styles.kicker}>Hiring Decision Report</Text>
        <Text style={styles.title}>{meta.candidate}</Text>
        <Text style={styles.meta}>
          Position: {meta.position}
          {"  ·  "}Stage: {meta.stage}
        </Text>
        <Text style={styles.meta}>
          {meta.interviewDate ? `Interview: ${meta.interviewDate}` : ""}
          {meta.interviewer ? `  ·  Interviewer: ${meta.interviewer}` : ""}
          {`  ·  Report: ${meta.reportDate}`}
        </Text>

        <View style={[styles.verdictBox, { borderLeftColor: color }]}>
          <Text style={[styles.verdictLabel, { color }]}>
            Verdict · Overall {report.overallScore}/5
          </Text>
          <Text style={styles.verdictText}>{report.verdict}</Text>
        </View>

        <Text style={styles.h2}>Executive Summary</Text>
        <Text>{report.summary}</Text>

        {report.scorecard.length > 0 && (
          <>
            <Text style={styles.h2}>At-a-glance scorecard</Text>
            <View style={styles.scHead}>
              <Text style={[styles.scDim, styles.th]}>Dimension</Text>
              <Text style={[styles.scScore, styles.th]}>Score</Text>
              <Text style={[styles.scNote, styles.th]}>Notes</Text>
            </View>
            {report.scorecard.map((s, i) => (
              <View key={i} style={styles.scRow} wrap={false}>
                <Text style={styles.scDim}>{s.dimension}</Text>
                <Text style={styles.scScore}>{s.score}/5</Text>
                <Text style={styles.scNote}>{s.note}</Text>
              </View>
            ))}
          </>
        )}

        {report.strengths.length > 0 && (
          <>
            <Text style={styles.h2}>Strengths</Text>
            {report.strengths.map((s, i) => (
              <View key={i} style={styles.block} wrap={false}>
                <Text style={styles.itemTitle}>{s.title}</Text>
                <Text>{s.detail}</Text>
              </View>
            ))}
          </>
        )}

        {report.concerns.length > 0 && (
          <>
            <Text style={styles.h2}>Concerns &amp; gaps</Text>
            {report.concerns.map((c, i) => (
              <View key={i} style={styles.block} wrap={false}>
                <Text style={styles.itemTitle}>{c.title}</Text>
                <Text>{c.detail}</Text>
              </View>
            ))}
          </>
        )}

        <Text style={styles.h2}>Recommendation</Text>
        <Text>{report.recommendation}</Text>

        {report.growthPlan.length > 0 && (
          <>
            <Text style={styles.h2}>Growth &amp; onboarding plan</Text>
            {report.growthPlan.map((g, i) => (
              <Bullet key={i}>{g}</Bullet>
            ))}
          </>
        )}
      </Page>
    </Document>
  );
}

export async function renderReportPdf(
  report: HiringReport,
  meta: ReportMeta
): Promise<Buffer> {
  return renderToBuffer(<ReportDoc report={report} meta={meta} />);
}
