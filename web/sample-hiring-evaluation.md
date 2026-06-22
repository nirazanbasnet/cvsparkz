Hiring Decision Report · Anish Kumar Shah
HIRING DECISION REPORT
Candidate: Anish Kumar Shah
Position evaluated: AI Engineer
Interview date: May 12, 2026 · Interviewer: Kiran Maiya Prajapati · Report date: May 14, 2026
Executive Summary
VERDICT
Conditional Hire — Junior AI Engineer (with structured growth plan)
Anish has the project delivery experience of a mid-level engineer but the theoretical foundations of
a junior. He has built and shipped real systems (OCR pipelines, RAG chatbots, multi-agent
workflows), yet his interview revealed serious gaps in Python fundamentals, concurrency, model
internals, and production RAG scalability. Hiring as a mid-level carries unacceptable risk; hiring as a
junior with a 6-month growth and mentorship plan is the safer path.
At-a-glance scorecard
Dimension Score Notes
Project experience & delivery 4 / 5 End-to-end ownership of OCR + RAG +
multi-agent systems
System design intuition 4 / 5 Clear narrative of architecture evolution under
real constraints
RAG / retrieval depth 3 / 5 Knows chunking + hybrid retrieval; doesn't know
ANN scaling
LLM fine-tuning depth 3.5 / 5 Strong LoRA math; weaker on VLM internals
Agent frameworks (CrewAI,
ReAct)
4 / 5 Hands-on, evolved from single-LLM to
planner/orchestrator
Python fundamentals 2 / 5 Could not explain @staticmethod vs
@classmethod
Concurrency & async 1.5 / 5 Reversed CPU-bound vs I/O-bound — significant
gap
ML/DL theory & internals 2 / 5 Used diffusion/layout models without
understanding them
Page 1
Hiring Decision Report · Anish Kumar Shah
Production / MLOps concerns 2 / 5 No grasp of vector indexing, drift, or scaling RAG
Communication & honesty 4 / 5 Hedged appropriately, admitted gaps honestly
Overall weighted 3.0 / 5 Solid Junior+ / weak Mid
Page 2
Hiring Decision Report · Anish Kumar Shah
Candidate Profile
Anish Kumar Shah is a 23–24 year old AI Engineer based in Lalitpur, Nepal, with approximately three
years of cumulative experience in applied AI/ML. He graduated with a B.E. in Computer Engineering from
Sagarmatha Engineering College (2018–2023) with 71% aggregate. His career has progressed through a
single primary employer (Vertex Special Technology) before switching to his current role at Braintip AI.
Career timeline
Period Role Company
Jun 2023 – Sep 2023
(~3 mo)
AI Engineer Intern Vertex Special Technology
Oct 2023 – Jan 2024
(~4 mo)
Trainee AI Engineer Vertex Special Technology
Jan 2024 – Aug 2025
(~20 mo)
Associate AI Engineer Vertex Special Technology
Aug 2025 – Present (~9
mo)
AI Engineer Braintip AI
Effective experience: ~3 years total (counting intern + trainee), of which ~2 years 5 months was at
Associate or full Engineer level. He has only worked at two companies, with internal title progression at
Vertex.
Sources reviewed
• Resume / CV (PDF) — Anish_Kumar_Shah_AI_Engineer_Resume.pdf
• Full interview transcript — Nepali video transcript organized into 11 segments
• Structured interview summary — Kiran Maiya Prajapati, May 12, 2026
Page 3
Hiring Decision Report · Anish Kumar Shah
Strengths
1. Genuine end-to-end project ownership
Anish was the sole driver on at least two production-grade projects: the OCR-based bank statement
extraction system at Vertex and the office HR document RAG chatbot. Both required navigating real
constraints — unstructured bank statements with handwritten elements, mixed tables, and a need for
lightweight inference. He described the iteration cycle honestly: starting with Tesseract / EasyOCR /
PaddleOCR comparisons, identifying the accuracy ceiling, then moving to layout-based cropping with
PaddleOCR's layout detection, then to fine-tuning, then to a Qwen 2.5 VLM (7B, 4-bit quantized) when
accuracy plateaued around 42%.
2. Real architectural evolution thinking
His description of the multi-agent workflow system at Braintip showed first-hand experience with a
system maturing under load. He started with a single LLM call producing one large JSON workflow
configuration. When accuracy degraded as event types multiplied, he refactored to a planner →
orchestrator → event-specialist agent topology, with each event type owned by a dedicated agent. This
kind of "build it simple, watch it break, refactor under pressure" experience is more valuable than
textbook knowledge for product engineering.
3. Strong mathematical grasp of LoRA
Asked about parameter-efficient fine-tuning, he gave a clean explanation of low-rank adaptation:
decomposing a target weight update ΔW into two smaller matrices A (r×d) and B (d×r) with rank r,
training only those adapter matrices, then merging back into the base model at inference. This was the
most theoretically solid moment of the interview and demonstrates he can engage with mathematics
when motivated.
4. Solid RAG architecture vocabulary
He correctly walked through the indexing and retrieval halves of his RAG implementation:
paragraph-based chunking, Qdrant as the vector store, cosine similarity initially, then hybrid retrieval
with BM25 + cosine to handle a class of queries where pure semantic search returned irrelevant results,
followed by a re-ranker for precision. He named multiple chunking strategies (fixed, fixed with overlap,
semantic) and could explain why overlap matters (e.g., "My name is Anish" split across chunks loses
context).
5. Modern agent stack hands-on
He has used CrewAI (agents with roles/backstories/tools), is conceptually familiar with ReAct (reasoning
+ acting), and uses mem0 as a semantic agent memory layer. He also identified Redis as a faster
short-term cache to complement persistent semantic memory.
6. Communication and honesty
Page 4
Hiring Decision Report · Anish Kumar Shah
Across the interview, when Anish did not know something, he said so ("I'm not sure," "I might be
confused," "the model name I don't exactly remember"). This is a genuine positive — it signals
coachability and reduces the risk of someone bluffing through technical decisions in production.