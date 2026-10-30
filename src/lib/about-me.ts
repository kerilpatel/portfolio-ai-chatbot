/**
 * Compact structured summary that is ALWAYS included in the system context,
 * regardless of retrieval. Protects against RAG missing obvious facts.
 *
 * Sourced from the portfolio site's own content (`portfolio-website`,
 * `src/constants/index.js` and `src/components/About.jsx`) so the two cannot
 * contradict each other. Nothing here is inferred - if the site does not state
 * it, it is not here, and the prompt tells the model to say it does not know
 * rather than fill the gap.
 *
 * Keep it compact: this block is billed on every uncached call. Editing it
 * moves SYSTEM_PROMPT_VERSION and invalidates any prompt cache, by design.
 */
export const ABOUT_ME = `
# Identity
Name: Keril Patel
Current role: Sr. Software Engineer at Nexa Mobility (Aug 2026 - present)
Location: Bengaluru, India
Experience: 3+ years
Focus: Full-stack and generative AI

# Summary
Software engineer building full-stack products and GenAI-powered features
across mobile, web and cloud. Comfortable across the stack, from SDK
development to LLM-powered systems.

# Experience
Nexa Mobility - Sr. Software Engineer (Aug 2026 - present)
- Building a project-tracking dashboard for top management, powered by an ETL
  pipeline and an LLM layer with RAG over rule-based metrics.

Zebra Technologies - Software Engineer (Mar 2024 - Aug 2026)
- Built a Flutter SDK and mobile application supporting Zebra printers across
  platforms.
- Owned a web application end-to-end in Next.js and Django, from design
  through deployment.
- Designed and shipped GenAI features for customer-facing and internal tools,
  including a RAG assistant, MCP integrations and multi-agent workflows.

Gida Technologies - Software Developer (Jul 2023 - Feb 2024)
- Built and shipped two applications, frontend and backend, from scratch in a
  fast-paced startup, working directly with clients on shifting requirements.

# Skills
Languages: Java, Python, Dart, JavaScript, TypeScript, SQL
Frameworks: Flutter, React, Next.js, Django
Generative AI: LLM APIs, RAG, vector stores, agentic development, MCP, fine
  tuning, LLM evals, human-in-the-loop
Architecture: clean architecture, cross-platform development, SDK and API
  design, state management, OAuth, native method channels, unit testing,
  Agile/SAFe, CI/CD automation

# Projects
Lumen - AI document workspace with bring-your-own-key LLM support and
  human-in-the-loop diff-preview edits, so every AI change is reviewed before
  it lands. React, TypeScript, Express, Tailwind. https://lumen.kerilpatel.com
Logator - Log aggregation platform with replay-resistant HMAC ingest, a
  non-blocking logging SDK and a live-tail dashboard. Python, Django, React,
  Docker. https://logator.kerilpatel.com
Claude Plugin Marketplace - Personal marketplace of Claude Code plugins,
  packaging agentic Skills that restructure and polish LaTeX documents, compile
  them to PDF and push versioned results to GitHub.
SmartSell - Engineering major project: retail sales analysis dashboard in
  Python and Streamlit with ML-based personalised recommendations.

# Education
B.E. Computer Science & Engineering, RV Institute of Technology and Management,
  Bengaluru (VTU), 2019-2023, CGPA 7.83/10. Founding member and head
  coordinator of the Entrepreneurship Cell, running events with 30+
  coordinators.
Kendriya Vidyalaya No. 2, Kribhco, Surat (CBSE), 2007-2019. 10th: 9.4 CGPA.
  12th: 77.6%.

# Certifications
GitHub Certified: Agentic AI Developer (Oct 2026)
NVIDIA-Certified Associate: Generative AI LLMs (Jul 2026)
AWS Certified Cloud Practitioner (Sep 2021)

# Contact
Email: kerilpatel@outlook.com
Site: kerilpatel.com
`.trim();
