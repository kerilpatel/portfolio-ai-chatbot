/**
 * The retrievable corpus (plan section 3).
 *
 * Distinct from `about-me.ts`, and the distinction is the whole point of the
 * hybrid approach: `about-me` is the compact summary sent on *every* call, so
 * it must stay small. This is the longer material that only earns its tokens
 * when a question actually calls for it - references, award detail, the notes
 * behind each skill, full project write-ups.
 *
 * Sourced from `portfolio-website`'s own content so the site and the bot
 * cannot contradict each other. Nothing here is invented.
 */
export type CorpusDocument = {
  /** Stable id - it ends up in logs and in retrieval traces. */
  id: string;
  /** Prepended to every chunk, so a retrieved fragment is self-describing. */
  title: string;
  text: string;
};

export const CORPUS: CorpusDocument[] = [
  {
    id: "reference-bret-anno",
    title:
      "Reference from Bret Anno, Director of Software Engineering, Zebra Technologies",
    text: "I worked with Keril on our mobile application team, where he consistently delivered high-quality features end to end. He built out complex connection-handling flows for mobile devices (iOS, Android, and Windows), taking ownership from UI design through backend data integration. What stood out most was his thoroughness - Keril has a strong eye for edge cases and a methodical approach to debugging. He's comfortable stepping outside his core mobile work to contribute to broader engineering initiatives, including internal AI tooling efforts. Keril is a dependable, detail-oriented engineer who raises the quality bar on any feature he touches. I'd welcome the chance to work with him again.",
  },
  {
    id: "reference-manjunath-gundurao",
    title:
      "Reference from Manjunath Gundurao, Engineering Manager, Zebra Technologies",
    text: "I had the pleasure of working with Keril and watching him grow from a talented intern into an indispensable asset to our team. Right from day one, he stood out for his ability to learn rapidly and transition seamlessly into contributing to live, mission-critical projects. What truly sets Keril apart is his proactive mindset - he consistently upgraded his skills to match evolving demands and quickly became our absolute go-to person for all AI initiatives and adoptions. His focus, dedication, and technical agility are rare to find. Keril is a top-tier professional who would be a highly valuable resource to any engineering organization, and I highly recommend him.",
  },
  {
    id: "reference-abhilash-k",
    title: "Reference from Abhilash K, Software Architect, Zebra Technologies",
    text: "I had the pleasure of working with Keril for nearly three years on several Flutter application and SDK projects, as well as a few AI-based initiatives. Keril has a strong technical foundation and is always eager to learn and embrace new technologies. He approaches every task with dedication, takes ownership of his work, and consistently strives to deliver high-quality solutions. Beyond his technical abilities, Keril is approachable, collaborative, receptive to feedback, and brings a positive attitude to the team. I truly enjoyed working with Keril and highly recommend him to anyone looking for a skilled, dependable, and motivated software engineer.",
  },
  {
    id: "reference-harsh-shah",
    title:
      "Reference from Harsh Shah, Senior Manager Product, 5paisa (ex-IIFL)",
    text: "I worked with Keril as he was handling our trading application development and the features Keril built are exceptionally well. Keril has exceptional knowledge of development and he understands the domain and severity very well. Grasping power is very good.",
  },
  {
    id: "reference-anjali-acharya",
    title:
      "Reference from Anjali S Acharya, DevOps and Network Specialist, peer and colleague",
    text: "Having studied alongside Keril, I've always been impressed by his initiative. A perfect example of this was when he founded our college's E-Cell club. He took on the massive responsibility of organizing and executing all of the club's events, consistently delivering successful outcomes through sheer dedication and sharp problem-solving. Beyond his strong work ethic, he is an excellent collaborator who brings out the best in everyone around him. If you are looking for someone who takes complete ownership and drives results, I highly recommend him.",
  },
  {
    id: "achievement-secure-code-warrior",
    title:
      "Achievement: 2x Secure Code Warrior Tournament Winner, Zebra Technologies",
    text: "Won the company-wide Secure Code Warrior tournament twice, demonstrating strong secure coding practices and application security awareness.",
  },
  {
    id: "achievement-best-presentation",
    title: "Achievement: Best Presentation Award, technical conference",
    text: "Received the Best Presentation Award at a technical conference for presenting a published research paper. The paper is available at https://tijer.org/tijer/viewpaperforall.php?paper=TIJERA001040",
  },
  {
    id: "skills-detail",
    title: "Where each skill was used",
    text: "Java: Android native layer and the Flutter SDK. Python: Django backends, Logator, SmartSell. Dart: the Flutter SDK at Zebra Technologies. JavaScript: React and Next.js web apps. TypeScript: building the Lumen AI document workspace. SQL: the Zebra web app data layer. Flutter: the cross-platform printer SDK at Zebra. React: the Lumen and Logator frontends. Next.js: owned the Zebra web app end-to-end. Django: the Zebra web backend and Logator. LLM APIs: Lumen's bring-your-own-key LLMs. RAG: shipped a RAG assistant at Zebra. Vector stores: retrieval for the Zebra RAG assistant. Agentic development: multi-agent workflows at Zebra. MCP: built MCP integrations at Zebra. Fine tuning: NVIDIA-Certified in Generative AI LLMs. LLM evals: validating GenAI feature quality at Zebra. Human-in-the-loop: Lumen's diff-preview AI edits. Clean architecture: the layered Flutter SDK at Zebra. SDK and API design: the Flutter SDK and the Logator logging SDK. OAuth: sign-in for the Zebra web app. Unit testing: edge-case rigor, praised by the engineering director. CI/CD automation: automated SDK builds and releases.",
  },
  {
    id: "certifications-detail",
    title: "Certifications, issuers and dates",
    text: "GitHub Certified: Agentic AI Developer, issued by GitHub in October 2026. NVIDIA-Certified Associate: Generative AI LLMs, issued by NVIDIA in July 2026. AWS Certified Cloud Practitioner, issued by Amazon Web Services Training and Certification in September 2021.",
  },
  {
    id: "education-detail",
    title: "Education detail",
    text: "B.E. Computer Science and Engineering at RV Institute of Technology and Management, Bangalore, affiliated to VTU, from 2019 to 2023, graduating with a CGPA of 7.83 out of 10. Founding member and head coordinator of The Entrepreneurship Cell, established to spread the word about entrepreneurship and cultivate problem-solving skills among students, organising and managing events with a team of 30 or more coordinators. For the engineering major project, developed SmartSell, a retail sales analysis dashboard using Python and Streamlit, implementing machine learning algorithms for personalised recommendations. Earlier schooling at Kendriya Vidyalaya No. 2, Kribhco, Surat under CBSE from 2007 to 2019: 10th Standard in 2017 with a CGPA of 9.4 out of 10, and 12th Standard in 2019 with 77.6 percent.",
  },
];
