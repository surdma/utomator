import { profileImage } from "./profile-image.ts";

// ──────────────────────────────────────────────────────────────
// Resume data: reviewed professional history and accomplishments
// Action verb format: [Verb] + [What] + [How] + [Result/Impact]
// ──────────────────────────────────────────────────────────────

export const resumeProfile = {
  name: "SODIQ OLADEJO",
  title: "PRODUCT-FOCUSED SOFTWARE ENGINEER | SYSTEMS & PRODUCT DELIVERY",
  photo: profileImage,
};

export const resumeContacts = [
  { icon: "phone", label: "+2349063305132" },
  { icon: "email", label: "devsurdma@gmail.com" },
  { icon: "link", label: "linktr.ee/surdma", href: "https://linktr.ee/surdma" },
  { icon: "link", label: "founder.relvor.org", href: "https://founder.relvor.org" },
  { icon: "location", label: "Lagos, Nigeria" },
];

export const resumeSummary =
  "Product-focused software engineer, engineering leader and technical founder working across backend systems, real-time products and platform reliability. My work includes SabiGo ride services, AEKO network development, Festacol examinations and connected commerce operations. I turn product requirements into maintainable systems and reliable user journeys.";

export const resumeEducation = {
  institution: "Federal University of Technology Minna",
  degree: "Bachelor of Technology (BTech), Mechatronics Engineering",
};

export const resumeExperience = [
  {
    company: "MilliHub",
    location: "Uyo, Nigeria(Remote)",
    role: "CAE / VP Engineering",
    period: "Current",
    bullets: [
      "Contribute technical engineering leadership and implementation work across SabiGo and AEKO product initiatives.",
      "Pioneered core ride, shared-trip and dispatch functionality within the Sabi Ride team.",
      "Worked across AEKO protocol, social features and network operations, including recovery of a stalled testnet.",
    ],
  },
  {
    company: "ADPDigitek",
    location: "Mallorca, Spain (Remote)",
    role: "Full Stack Developer",
    period: "03/2025 to 07/2026",
    bullets: [
      "Worked on connected customer-facing and backend product features for a remote European startup.",
      "Improved frontend rendering and performance as part of delivering smoother customer journeys.",
      "Collaborated with design, product and QA colleagues to turn requirements and feedback into working features.",
    ],
  },
  {
    company: "GlobalAcademies",
    location: "Georgia, United States (Remote)",
    role: "Full Stack Developer (Part-Time)",
    period: "07/2024 to 01/2025",
    bullets: [
      "Developed question-rephrasing functionality for USMLE Focus to make repeated medical-exam practice more varied and useful.",
      "Improved the exam-preparation application's usability and responsiveness across client and server workflows.",
      "Maintained backend services and APIs, ensuring seamless data processing across platform components.",
      "Translated user feedback into effective technical solutions, directly addressing exam preparation challenges.",
    ],
  },
  {
    company: "Memoapps Limited",
    location: "Chennai, India (Remote)",
    role: "Backend Developer",
    period: "09/2023 to 06/2024",
    bullets: [
      "Built and maintained the services behind Memoneet's communication experience, with attention to dependable messaging and service operation.",
      "Designed RESTful APIs and microservices, enabling seamless integration across platform components.",
      "Investigated data-access bottlenecks and improved query and caching behavior in communication workflows.",
      "Implemented secure authentication and authorization protocols, safeguarding user data integrity.",
      "Streamlined CI/CD deployment processes with DevOps teams, ensuring timely feature releases.",
    ],
  },
  {
    company: "Kinpeak Limited",
    location: "Ibadan, Oyo State",
    role: "Fullstack Developer",
    period: "09/2021 to 08/2023",
    bullets: [
      "Developed backend services that supported high-traffic product workflows and required dependable responses under load.",
      "Designed scalable RESTful APIs and real-time WebSocket services, directly enhancing user engagement.",
      "Improved database access patterns to keep commonly used product operations responsive.",
      "Integrated Redis and RabbitMQ for asynchronous processing, managing peak loads efficiently.",
      "Took full ownership of code quality and deployment within cross-functional agile teams.",
    ],
  },
  {
    company: "Adroit Solutions Limited",
    location: "Lagos, Nigeria",
    role: "Backend Developer Intern",
    period: "02/2021 to 08/2021",
    bullets: [
      "Built REST API endpoints using Django, Flask, and Node.js for internal and client-facing applications.",
      "Managed relational and non-relational databases, optimizing queries for smooth cross-module data flow.",
      "Participated in sprint reviews and code refactoring, improving codebase maintainability.",
      "Integrated backend services with frontend applications in a collaborative, fast-paced environment.",
    ],
  },
];

// A compact cross-section of the work. The project catalog carries dates and details.
export const resumeSelectedWork = [
  {
    slug: "aeko-chain",
    label: "AEKO",
    summary: "Helped restore a stalled testnet and developed native blockchain and social features.",
  },
  {
    slug: "sabi-ride",
    label: "SabiGo",
    summary: "Pioneered ride, shared-trip and dispatch services within the Sabi Ride team.",
  },
  {
    slug: "festacol",
    label: "Festacol",
    summary: "Created connected examination workflows for students, teachers and school administrators.",
  },
  {
    slug: "laitstyles",
    label: "Laitstyles",
    summary: "Integrated inventory, orders and payment workflows for a development-stage retail product.",
  },
  {
    slug: "flutterwave-django",
    label: "FlutterwaveDjango",
    summary: "Published a reusable Django library for common Flutterwave payment and payout integrations.",
  },
  {
    slug: "healthcare-waste-monitoring",
    label: "Healthcare Waste Monitoring",
    summary: "Built a prototype connecting ward monitoring, collection alerts and experimental robotics.",
  },
] as const;

// Skills describe capabilities. Technologies and services are listed separately.
export const resumeSkills = [
  "Backend and API architecture",
  "Technical leadership and mentoring",
  "System design and integration",
  "Performance and reliability",
  "Cross-functional product delivery",
];

export const resumeCourses = [
  {
    title: "Professional RESTful API Design",
    institution: "Alison Foundation",
  },
  {
    title: "Diploma in Scalable Web Development",
    institution: "",
  },
];
