// ──────────────────────────────────────────────────────────────
// Portfolio data: single source of truth
// ──────────────────────────────────────────────────────────────

export const siteConfig = {
  name: "Surdma",
  fullName: "Sodiq Opeyemi Oladejo",
  url: "https://founder.relvor.org",
  title: "Software Engineer · CAE / VP Engineering at MilliHub · Technical Founder of Relvor",
  email: "devsurdma@gmail.com",
  location: "Lagos, Nigeria",
  resumeUrl:"/resume",
  tagline:
    "Product-focused software engineer, engineering leader and technical founder working across backend systems, real-time products and platform reliability.",
  bio: [
    "From SabiGo's ride services to AEKO's network recovery and Festacol's examination platform, I connect difficult engineering problems to dependable product delivery.",
  ],
};

// ── Social Links ────────────────────────────────────────────
export const socialLinks = {
  github: "https://github.com/surdma",
  twitter: "https://x.com/surdma",
  linkedin: "https://linkedin.com/in/surdma",
  instagram: "https://instagram.com/surdma_",
  devto: "https://dev.to/surdma",
  upwork:
    "https://www.upwork.com/freelancers/~01c59275d4369dcf9b",
  linktree: "https://linktr.ee/surdma",
};

// ── Projects ────────────────────────────────────────────────
export type Project = {
  title: string;
  description: string;
  longDescription?: string;
  liveUrl: string;
  githubUrl?: string;
  tags: string[];
  category: "web" | "mobile" | "fullstack" | "package" | "platform" | "iot";
  slug?: string;
  role?: string;
  status?: string;
  liveLabel?: string;
  impactSummary?: string;
  problem?: string;
  ownership?: string;
  outcome?: string;
  highlights?: string[];
  evidence?: { value: string; label: string; sourceUrl: string }[];
  repositories?: { name: string; url: string; visibility: "public" | "private" }[];
  featured?: boolean;
  year: string;
};

export const projects: Project[] = [
  {
    title: "Path-Planning Algorithms: Search and Motion Planning",
    slug: "path-planning-algorithms",
    year: "2025",
    category: "package",
    featured: false,
    liveUrl: "https://github.com/surdma/Path-Planning-Algorithms",
    liveLabel: "Explore Python implementations",
    tags: ["Python", "Algorithms", "Path planning", "Robotics research"],
    description: "Implemented and demonstrated Dijkstra, A*, RRT and RRT* path-planning algorithms in Python to explore different approaches to route search and motion planning.",
    longDescription: "Path planning connects algorithmic reasoning to real movement problems. This public repository contains independent Python implementations of Dijkstra, A*, RRT and RRT*, with demonstrations of how different search and sampling approaches construct paths through a map.",
    role: "Independent algorithm developer",
    status: "Open-source implementations",
    impactSummary: "A public collection of four path-planning implementations and demonstrations, without claims of commercial robotics deployment.",
    problem: "Shortest-path search and sample-based motion planning make different trade-offs when navigating maps and obstacles. Exploring them side by side makes their behaviors easier to study and compare.",
    ownership: "Implemented the Python algorithm modules and published demonstrations for Dijkstra, A*, RRT and RRT*. The repository provides source code and example visualizations rather than evidence of integration with autonomous hardware.",
    outcome: "Made multiple algorithmic approaches available as inspectable Python source with video demonstrations. There is no verified production deployment, benchmarking result or real-world navigation claim.",
    highlights: [
      "Implemented graph-search approaches with Dijkstra and A*.",
      "Explored sampling-based route construction using RRT and its optimization variant RRT*.",
      "Published source code and demonstrations for inspection and further experimentation."
    ],
    repositories: [
      {
        name: "Path-Planning Algorithms",
        url: "https://github.com/surdma/Path-Planning-Algorithms",
        visibility: "public"
      }
    ]
  },
  {
    "title": "AEKO: Building a Distinct Layer-1 Network",
    "slug": "aeko-chain",
    "year": "2026",
    "category": "platform",
    "featured": true,
    "description": "Helped turn a Solana-derived starting point into AEKO's own blockchain network, with native social features, a creator economy, developer tools and real network operations.",
    "longDescription": "AEKO began from an established execution model, but a new name was never going to make it a new product. I worked across the chain itself and the products around it to give AEKO a reason to exist: people can build social applications, exchange value, discover on-chain activity and develop against an independently operated network.",
    "role": "Core blockchain and product engineer",
    "status": "Public network explorer",
    "liveUrl": "https://scan.aeko.online/",
    "liveLabel": "Explore AEKO Scan",
    "githubUrl": "https://github.com/MilliHub-dev/aeko-chain",
    "tags": [
      "Rust",
      "Blockchain",
      "PostgreSQL",
      "DevOps"
    ],
    "impactSummary": "Built AEKO-specific social and economic capabilities while bringing its network, Explorer and developer experience together.",
    "problem": "A renamed blockchain inherited a capable transaction engine but lacked its own product identity, useful social behavior and a dependable way for developers and operators to run it. Parts of the test network initially produced no blocks; essential activity could not reliably reach wallets or the Explorer.",
    "ownership": "I worked at the heart of the AEKO implementation, from native SocialFi functionality and protocol-level economic and permission systems to validator operations, Rust services, the Explorer, web applications, command-line tools and deployment. I took problems across system boundaries rather than treating chain code and user-facing products as separate jobs.",
    "outcome": "AEKO now has native foundations for identity, posts, engagement, creator rewards, staking and payments, alongside its own protocol capabilities, public-facing Explorer, funding controls and developer studio. I also traced and resolved the zero-block network failure so transactions could confirm and be seen. This is a functioning AEKO-specific Layer-1 effort built on Solana-derived technology, not a claim that I invented the underlying consensus design or that every capability has reached mature mainnet scale.",
    "highlights": [
      "Designed and implemented AEKO-specific social behavior and creator-economy flows inside the network, rather than building a social app that merely stores transactions elsewhere.",
      "Extended the chain's protocol with token, permission and security capabilities while addressing safe upgrades that preserve existing network history.",
      "Diagnosed an actual deployment where the network produced no blocks, then restored block production, RPC access and visible confirmed transactions.",
      "Built the product surfaces around the network: Explorer and its persistent data, wallet and funding experiences, developer SDKs, CLI tooling and Contract Studio.",
      "Worked across Rust, Axum, Next.js, deployment and testing to make the protocol usable by the people building on it and operating it."
    ],
    "evidence": [],
    "repositories": [
      {
        "name": "AEKO Chain",
        "url": "https://github.com/MilliHub-dev/aeko-chain",
        "visibility": "public"
      }
    ]
  },
  {
    "title": "Laitstyles: From Storefront to Retail Operations",
    "slug": "laitstyles",
    "year": "2026",
    "category": "fullstack",
    "featured": true,
    "description": "Helped make Laitstyles a store a business can run, connecting products, stock, orders, customer accounts, payments and day-to-day decisions.",
    "longDescription": "For a retailer, a good-looking shop is the starting line. Stock has to match what is for sale, customers need confidence at checkout, and the team needs to understand orders, returns and payments. I worked on the difficult transition from storefront screens toward the real operating flows behind them.",
    "role": "Major engineer across storefront, operations and payments",
    "status": "Development environment",
    "liveUrl": "https://dev.laitstyles.com/",
    "liveLabel": "Open development site",
    "githubUrl": "https://github.com/relvorlabs/laitstyles",
    "tags": [
      "Next.js",
      "PostgreSQL",
      "Prisma",
      "Payments"
    ],
    "impactSummary": "Connected shopping and back-office decisions so the store could operate beyond a product catalogue.",
    "problem": "Several parts of the shop existed as separate experiences. Product data, stock movement, customer accounts, checkout and financial status needed to agree with one another. A failed payment or incomplete order cannot simply leave a customer, owner and database with different stories.",
    "ownership": "I took on connected pieces of the retail business rather than isolated interface tickets. My work covered product creation and importing, stock and order handling, customer accounts and security, checkout recovery, refunds and financial records. I also coordinated related payment work while keeping the approved customer experience recognizable.",
    "outcome": "The store has a clearer path from a product being listed to a customer placing an order, staff managing fulfillment and finance staff tracing payment outcomes. We introduced explicit handling for interrupted or failed checkout states and more dependable business records. These are meaningful operational capabilities; a revenue or conversion improvement would require analytics the repository does not provide.",
    "highlights": [
      "Moved the catalogue and inventory from brittle prototype assumptions toward product and stock records that operations can trust.",
      "Connected customer profiles, saved information and order history to real account journeys.",
      "Worked through checkout failures, unfinished payments, returns and refunds so a transaction has a traceable outcome.",
      "Built the owner's view of orders, customers and financial activity without disrupting the established storefront experience.",
      "Helped coordinate related work across payment, account and back-office flows, preserving consistency when several parts changed together."
    ],
    "evidence": [],
    "repositories": [
      {
        "name": "Laitstyles storefront and operations",
        "url": "https://github.com/relvorlabs/laitstyles",
        "visibility": "public"
      }
    ]
  },
  {
    "title": "Festacol: Examinations Schools Can Depend On",
    "slug": "festacol",
    "year": "2026",
    "category": "fullstack",
    "featured": true,
    "description": "Created a school examination platform that brings candidate entry, timed tests, saved answers, results and staff administration into one clear experience.",
    "longDescription": "A school exam is a high-stakes journey for the student and an operational challenge for the staff. Before the first question, there are classes, candidates, access rules and papers. During the exam, students need a calm interface and confidence their answers will survive interruptions. Afterward, results must be useful and trustworthy.",
    "role": "Creator and product engineer",
    "status": "Active development preview",
    "liveUrl": "https://festacol.vercel.app/",
    "liveLabel": "Open examination preview",
    "githubUrl": "https://github.com/surdma/festacol",
    "tags": [
      "Next.js",
      "EdTech",
      "PostgreSQL",
      "UX"
    ],
    "impactSummary": "Replaced disconnected exam experiences with a complete journey for students, teachers and school administrators.",
    "problem": "Early exam prototypes made it difficult to deliver a coherent experience from invitation through submission and result. The system also needed to distinguish student and teacher responsibilities, recover interrupted work, and enforce the same examination rules everywhere.",
    "ownership": "I started Festacol and led the product decisions behind its assessment flow. I worked from candidate arrival and accessible navigation through answer recovery, timing, marking, result history and staff tools. I also replaced generic school settings with controls tied to actual classes, subject offerings and roles.",
    "outcome": "Festacol now connects paper preparation, candidate access, the examination session and post-exam records in one product. The assessment policy supports longer papers without contradictory application/database limits, and eligible students can resume their work after an interruption. School adoption and actual time savings are not yet quantified.",
    "highlights": [
      "Designed the examination experience around the student: enter, understand the paper, answer, review and submit without competing controls.",
      "Built answer saving and attempt recovery around the risk of losing work when a device refreshes or a connection drops.",
      "Connected examination access, enrollment and results to school records instead of relying on disconnected candidate lists.",
      "Created different workflows for teachers and administrators because their academic decisions and permissions are different.",
      "Resolved inconsistencies between paper-size and duration rules so schools are not blocked by competing limits."
    ],
    "evidence": [],
    "repositories": [
      {
        "name": "Festacol assessment and academic operations",
        "url": "https://github.com/surdma/festacol",
        "visibility": "public"
      }
    ]
  },
  {
    "title": "SabiGo: The Engine Behind Sabi Ride",
    "slug": "sabi-ride",
    "year": "2024–2025",
    "category": "fullstack",
    "description": "Pioneered and built the core SabiGo service that gives Sabi Ride its ride-hailing, shared journeys, group rides and delivery operations.",
    "longDescription": "Sabi Ride is about much more than displaying a car on a map. Its product has to coordinate real people, uncertain locations, driver availability, fares, live movement, cancellations and the moment a journey or delivery is actually complete. I was a pioneering core developer of SabiGo, the service that makes those operations possible.",
    "role": "Pioneering SabiGo developer and core ride-services owner",
    "status": "Public product website",
    "liveUrl": "https://www.sabiride.net/",
    "liveLabel": "Visit Sabi Ride",
    "tags": [
      "Python",
      "Django",
      "WebSockets",
      "Mobility"
    ],
    "impactSummary": "Turned transport ideas into coordinated ride, sharing and delivery journeys, from booking to fulfillment.",
    "problem": "A transport marketplace cannot operate on booking screens alone. Drivers and passengers need to find each other, understand a trip, agree on and track the journey, receive timely updates and complete payments. Shared/group journeys and parcel deliveries introduce different participants and completion rules.",
    "ownership": "I pioneered the SabiGo backend and owned substantial parts of its ride service: matching and proximity, fare estimation and trip states, group and shared rides, location streaming, driver/passenger messages and delivery flows. I also handled the less visible work of reorganizing services and addressing notification loss and disconnects. This was foundational product engineering within the wider Sabi Ride team.",
    "outcome": "The system supports the operating journey behind ride-hailing, ride sharing, group coordination and dispatch delivery: requesting, matching, tracking, communicating, completing and recording what happened. Sabi Ride publicly presents these as services; the repository shows the service work behind them. I do not attribute the entire company or every app feature to myself, and no unverified volume or revenue figure is claimed.",
    "highlights": [
      "Pioneered the SabiGo ride-service foundation and evolved it into a set of connected journeys instead of isolated request handlers.",
      "Built driver/passenger matching, proximity and location-aware decisions so requests could become actual assignments.",
      "Developed the mechanics for shared and group rides, including joining, coordinating passengers and managing journeys in progress.",
      "Extended the same operating foundation into dispatch and parcel delivery, with recipient details, order states and proof/confirmation steps.",
      "Improved real-time communication, reconnection, acknowledgement and notification fallback so critical journey updates were less likely to disappear."
    ],
    "evidence": [],
    "repositories": [
      {
        "name": "Sabi Ride backend (private)",
        "url": "https://github.com/MilliHub-dev/sabi_ride_backend",
        "visibility": "private"
      }
    ]
  },
  {
    "title": "Healthcare Waste Monitoring & Robotics",
    "slug": "healthcare-waste-monitoring",
    "year": "2025",
    "category": "iot",
    "description": "Built a monitoring and experimental robotics system to help healthcare operators see which waste bins need attention and coordinate collection work.",
    "longDescription": "In a hospital, uncollected waste is an operational and safety problem, not simply a dashboard number. I explored how ward-by-ward monitoring, alerts and collection coordination could give operators a clearer view of what needs to happen, while experimenting with hardware-driven collection.",
    "role": "Project developer across operations software and connected devices",
    "status": "Prototype preview",
    "liveUrl": "https://hwams.vercel.app/",
    "liveLabel": "Open prototype preview",
    "tags": [
      "Next.js",
      "FastAPI",
      "IoT",
      "Monitoring"
    ],
    "impactSummary": "Brought ward monitoring, alerts and collection decisions into one operational prototype.",
    "problem": "Without a common view of fill levels, bin conditions and collection activity, staff must rely on fragmented checks. Connecting sensors and a mobile collector adds another challenge: what the machine reports must be understandable and actionable by a person.",
    "ownership": "I developed both the monitoring interface and the backend behind ward status, alerts, collection priorities and robot controls. The project also involved experiments with Raspberry Pi agents, sensors, navigation, camera feeds and communication with devices.",
    "outcome": "The result is an operational prototype that brings together real-time-style ward information, collection scheduling, status and device-control experiments. Some inputs and robotics behavior remain simulated or exploratory, so this is not described as an autonomously deployed hospital fleet or a measured reduction in waste collection costs.",
    "highlights": [
      "Built ward-focused monitoring so an operator can identify bins and locations requiring attention, rather than reading disconnected sensor logs.",
      "Connected status updates, alert history and collection priorities to decisions about what to collect next.",
      "Explored scheduling, robot control and return-to-base operations as part of one collection workflow.",
      "Worked across browser, server and device-facing code to bridge the gap between physical sensor events and operational actions."
    ],
    "evidence": [],
    "repositories": [
      {
        "name": "Monitoring frontend (private)",
        "url": "https://github.com/surdma/waste_monitoring_system",
        "visibility": "private"
      },
      {
        "name": "Monitoring backend and hardware (private)",
        "url": "https://github.com/surdma/waste_monitoring_system_backend",
        "visibility": "private"
      }
    ]
  },
  {
    "title": "USMLE Focus: Medical Exam Preparation",
    "slug": "usmle-focus",
    "year": "2024",
    "category": "fullstack",
    "featured": false,
    "liveUrl": "https://app.usmlefocus.com/",
    "liveLabel": "Open USMLE Focus",
    "tags": [
      "Education",
      "Medical exam preparation",
      "Full-stack"
    ],
    "description": "Worked on a medical exam-preparation experience that helps candidates practise questions and learn from performance instead of relying on passive revision alone.",
    "longDescription": "Preparing for medical licensing exams means answering many questions, identifying why an answer is wrong and returning to weak topics. My work at GlobalAcademies included the USMLE Focus learning experience and question presentation, with an emphasis on making practice more useful to candidates.",
    "role": "Full-stack developer at GlobalAcademies",
    "status": "Public application",
    "impactSummary": "Helped turn question practice and feedback into a more usable learning journey.",
    "problem": "A useful exam-preparation service needs more than a library of questions. Students need approachable practice, enough question variety to keep learning meaningful and feedback that tells them where to focus next.",
    "ownership": "As part of the GlobalAcademies team, I worked on the learner-facing and underlying application experience, including question presentation and the AI-assisted question-rephrasing work described in my employment history. No source repository is linked here, so this description does not imply sole ownership of the platform.",
    "outcome": "The product offers a question-bank experience intended to support repeated practice and targeted revision. I do not attribute an unverified student total, load-time improvement or test-score uplift to this work.",
    "highlights": [
      "Contributed to how medical candidates practise and revisit exam questions.",
      "Worked on question variation aimed at supporting more useful repeated practice.",
      "Connected work on the learning experience to the needs of exam candidates, rather than treating the question bank as a static content page."
    ]
  },
  {
    "title": "One Day With Difabel: Inclusive Experiences",
    "slug": "difabel",
    "year": "2024",
    "category": "web",
    "featured": false,
    "liveUrl": "https://difabel.vercel.app/",
    "liveLabel": "View site preview",
    "tags": [
      "Social impact",
      "Experience booking",
      "Web"
    ],
    "description": "Built a public-facing experience for a Balinese foundation that supports people with disabilities through cultural activities, community visibility and ways to engage.",
    "longDescription": "One Day With Difabel is about making the people and activities of the Cahaya Mutiara Ubud Foundation visible. The site introduces the foundation, showcases workshops and cultural experiences, and gives interested visitors clear routes to contact, reserve or support its work.",
    "role": "Website developer",
    "status": "Website preview",
    "impactSummary": "Created a clearer path from discovering the foundation to exploring its activities and expressing support.",
    "problem": "A cause can be difficult to support when people cannot see the work, understand the experiences or find a clear next step. The foundation needed more than an informational page.",
    "ownership": "I built the site's connected content and visitor paths, including activity discovery, galleries, reservation information, contact and donation entry points. The repository contains payment-provider test links, so this is not a claim of live transaction processing.",
    "outcome": "Visitors can learn about the foundation's mission, discover Balinese activity programmes and navigate to enquiries, reservations or donation links. No booking volume or fundraising growth is claimed.",
    "highlights": [
      "Presented the foundation's disability-inclusion mission in a more approachable visitor journey.",
      "Connected programmes and cultural workshops with reservation and enquiry routes.",
      "Integrated clearly visible support and donation entry points while keeping payment-test limitations explicit."
    ],
    "repositories": [
      {
        "name": "Difabel website source (private)",
        "url": "https://github.com/surdma/Difabel",
        "visibility": "private"
      }
    ]
  },
  {
    "title": "SmartFit: Try Before You Buy",
    "slug": "smartfit",
    "year": "2025–2026",
    "category": "web",
    "featured": false,
    "liveUrl": "https://smartfit-peach.vercel.app/",
    "liveLabel": "View repository-listed preview",
    "tags": [
      "Retail",
      "Virtual try-on",
      "3D experience"
    ],
    "description": "Developed a virtual clothing try-on concept to help shoppers judge how an outfit might look on them before purchasing.",
    "longDescription": "Clothing shoppers often make decisions from flat product photos, uncertain about how a garment will look on their own body. SmartFit explores a more personal shopping experience using photos and a digital model to preview clothing choices before buying.",
    "role": "Product and application developer",
    "status": "Product prototype",
    "impactSummary": "Explored a shopping journey aimed at improving fit confidence before checkout.",
    "problem": "Uncertainty about fit creates hesitation and can lead to buyer regret. Online shopping does not offer the reassurance of a fitting room.",
    "ownership": "I developed the product interface and interactive account/dashboard flows for a virtual fitting experience, including the path from user onboarding toward personal model and outfit exploration. The repository describes AI/3D model creation as a product flow; it does not prove that its full garment simulation is production validated.",
    "outcome": "The application provides a foundation for exploring clothing on a personal digital representation and making shopping decisions with more context. Reduced returns and increased conversion remain business goals, not measured achievements.",
    "highlights": [
      "Translated the fitting-room problem into a guided photo-to-model and clothing-exploration journey.",
      "Developed onboarding, account and dashboard experiences around the shopper rather than the clothing catalogue alone.",
      "Defined how fit confidence could improve retail decisions without claiming unmeasured return-rate improvements."
    ],
    "repositories": [
      {
        "name": "SmartFit prototype source (private)",
        "url": "https://github.com/surdma/smartfit",
        "visibility": "private"
      }
    ]
  },
  {
    "title": "Algorizmy: A Digital Studio Presence",
    "slug": "algorizmy",
    "year": "2025",
    "category": "web",
    "featured": false,
    "liveUrl": "https://algorizmy-five.vercel.app/",
    "liveLabel": "View studio site",
    "tags": [
      "Agency website",
      "Brand storytelling",
      "Interactive design"
    ],
    "description": "Created an expressive digital-studio website to explain services, show creative work and move prospective clients toward a conversation.",
    "longDescription": "A design and development studio needs to demonstrate its standards in the way it introduces itself. Algorizmy uses visual storytelling, client-oriented services and curated work to make an otherwise abstract offer easier for prospective customers to understand.",
    "role": "Website and interaction developer",
    "status": "Site preview",
    "impactSummary": "Turned a broad agency proposition into a browsable experience with work, capabilities and contact paths.",
    "problem": "Prospective clients need to understand what a studio does and how it works before they will start a project. A feature list alone does not build that confidence.",
    "ownership": "I worked on the site's service narrative, animated presentation, case-study browsing and responsive navigation. The repository is an agency/creative-business site, not the algorithm-learning platform previously claimed in my portfolio.",
    "outcome": "The resulting experience brings positioning, work examples and contact routes together. Conversion rates and signed-client numbers are not established by the repository.",
    "highlights": [
      "Presented services and past work as evidence of a studio's approach rather than a disconnected capability list.",
      "Developed interactive storytelling and responsive navigation across the site's key destinations.",
      "Aligned visuals, messaging and contact paths to the practical goal of generating informed client enquiries."
    ],
    "repositories": [
      {
        "name": "Algorizmy website source (private)",
        "url": "https://github.com/surdma/algorizmy",
        "visibility": "private"
      }
    ]
  },
  {
    "title": "Spacar: Automotive Showcase Concept",
    "slug": "spacar",
    "year": "2024",
    "category": "web",
    "featured": false,
    "liveUrl": "https://spacar.vercel.app/",
    "liveLabel": "View original preview",
    "tags": [
      "Automotive",
      "Product presentation",
      "Web"
    ],
    "description": "Explored how an automotive brand can present vehicles and guide a visitor from first impression toward closer product discovery.",
    "longDescription": "An automotive website has to make a product desirable while letting people understand what they are looking at. Spacar is included as an earlier presentation concept, not as a verified booking, inventory or sales platform.",
    "role": "Portfolio design and frontend work",
    "status": "Earlier showcase; source not linked",
    "impactSummary": "Explored an automotive browsing and presentation experience with a clear customer-facing purpose.",
    "problem": "Vehicle presentation needs to balance visual appeal with usable information; an impressive first screen alone is not a useful browsing experience.",
    "ownership": "This older work was already listed in my portfolio, but its source repository and current deployment could not be verified during the review. I have kept its claims limited to the showcased design intent, without attributing commercial or backend capabilities that cannot be inspected.",
    "outcome": "A portfolio-level automotive presentation concept. There is no basis here to claim live bookings, increased enquiries, sales or production use.",
    "highlights": [
      "Explored product-led presentation for an automotive audience.",
      "Approached visual hierarchy around visitor attention and vehicle discovery.",
      "Kept this case limited to an earlier showcase because delivery and business outcomes remain undocumented."
    ]
  },
  {
    "title": "OneUp: Digital Services & Hosting",
    "slug": "oneup",
    "year": "2025",
    "category": "web",
    "featured": false,
    "liveUrl": "https://oneup-two.vercel.app/",
    "liveLabel": "View website preview",
    "tags": [
      "Agency services",
      "Hosting",
      "3D web"
    ],
    "description": "Developed a services website helping businesses discover web development, hosting and digital experience offerings and find a route to enquiry.",
    "longDescription": "OneUp's product is a digital-services business presence: website development, hosting, interactive experiences and service enquiries. The site's purpose is to turn a broad set of technical offerings into a proposition a potential customer can understand.",
    "role": "Web application developer",
    "status": "Website preview",
    "impactSummary": "Organized web, hosting and digital-service offerings into a coherent customer discovery journey.",
    "problem": "A services company can lose buyers when visitors cannot distinguish what is offered, why it matters or how to get started.",
    "ownership": "I worked on the site's home, services, hosting showcase, affiliate and contact routes, including interactive presentation and mobile navigation. The actual repository is not the learning-platform project previously described in the portfolio.",
    "outcome": "The site provides accessible service discovery and contact paths. It does not prove increased leads, hosting subscriptions or revenue without customer data.",
    "highlights": [
      "Connected the site's services and hosting information so a visitor can understand what is available.",
      "Built routes for service discovery, affiliate information, enquiries and supporting business information.",
      "Used interactive presentation with a practical aim: making a potentially abstract digital-services offer easier to buy."
    ],
    "repositories": [
      {
        "name": "OneUp website source (private)",
        "url": "https://github.com/surdma/oneup",
        "visibility": "private"
      }
    ]
  },
  {
    "title": "UTME Prep: Study Beyond a Single Practice Test",
    "slug": "utme-prep",
    "year": "2023",
    "category": "mobile",
    "featured": false,
    "liveUrl": "https://utme-ebon.vercel.app/",
    "liveLabel": "View linked preview",
    "tags": [
      "Education",
      "Flutter",
      "Exam preparation"
    ],
    "description": "Developed a mobile-focused UTME/JAMB study application bringing practice, challenges, results, revision tools and learning support into one place.",
    "longDescription": "UTME candidates need repeated practice, feedback and help sustaining a study habit. The repository goes beyond a simple set of multiple-choice questions: it includes exam practice, challenges, performance views and supporting learning tools across a cross-platform Flutter application.",
    "role": "Mobile application developer",
    "status": "Application code; preview link not independently verified",
    "impactSummary": "Brought practice, progress and study support into one candidate-focused examination experience.",
    "problem": "Students preparing for entrance examinations often move between separate practice papers, reference material and score trackers, making weaknesses harder to see and revision less structured.",
    "ownership": "I developed the application experience and its supporting flows for aptitude practice, challenges, results, performance, notes, reference material and learner accounts. The inspected source is Flutter rather than the Next.js app previously asserted in the portfolio.",
    "outcome": "The repository contains a broad learning workflow that connects answering questions with reviewing progress and returning to revision. Actual exam-score gains, active learner counts and the identity of the linked web preview are not established here.",
    "highlights": [
      "Combined aptitude practice and timed or challenge-style activities within one study experience.",
      "Added result and performance destinations so practice can inform the next revision session.",
      "Included supporting tools such as notes and a dictionary to keep common study tasks within reach."
    ],
    "repositories": [
      {
        "name": "UTME Flutter app source (private)",
        "url": "https://github.com/surdma/utme",
        "visibility": "private"
      },
      {
        "name": "UTME desktop work (private)",
        "url": "https://github.com/surdma/utme_desktop",
        "visibility": "private"
      }
    ]
  },
  {
    "title": "FlutterwaveDjango: Reusable Payment Integration",
    "slug": "flutterwave-django",
    "year": "2024",
    "category": "package",
    "featured": false,
    "liveUrl": "https://pypi.org/project/flutterwavedjango/",
    "liveLabel": "View published Python package",
    "githubUrl": "https://github.com/surdma/FlutterWaveDjango",
    "tags": [
      "Open source",
      "Payments",
      "Python",
      "Django"
    ],
    "description": "Published an integration library to spare Django developers from rewriting common Flutterwave payment and payout interactions in every application.",
    "longDescription": "Every payment-enabled product needs to initiate and check charges, handle validation and make payouts. Reimplementing provider interactions from scratch adds time and creates repeated points of failure. I packaged commonly needed Flutterwave operations into a reusable Python library with a public release.",
    "role": "Library author and package maintainer",
    "status": "Published on PyPI",
    "impactSummary": "Made common payment-provider operations reusable across Django projects instead of one-off integrations.",
    "problem": "A small development team should not have to repeat the same provider-specific calls every time it adds a payment step to an application.",
    "ownership": "I authored and published FlutterwaveDjango, including card charge initiation, verification, OTP/PIN-related responses and transfer/payout operations wrapped behind a simpler interface. This is an integration layer over Flutterwave's existing SDK, not a claim to have built the payment network or implemented every authentication step.",
    "outcome": "The package is publicly installable and provides a shared starting point for payment integration in Django products. PyPI confirms the release and maintainer identity; download counts, time saved and production transaction volume are not verified here.",
    "highlights": [
      "Published and maintained a reusable library instead of keeping provider integration private to one app.",
      "Centralized common charge, verification and payout calls behind a consistent developer-facing interface.",
      "Documented how to use test and live environments while avoiding unsupported claims about complete payment compliance."
    ],
    "repositories": [
      {
        "name": "FlutterwaveDjango source",
        "url": "https://github.com/surdma/FlutterWaveDjango",
        "visibility": "public"
      }
    ]
  },
];

// ── Experience ────────────────────────────────────────────
export const experiences = [
  {
    position: "CAE / VP Engineering",
    company: "MilliHub",
    companyLink: "https://github.com/MilliHub-dev",
    duration: "Current",
    address: "Engineering & product development",
    work: "Contribute engineering direction and hands-on delivery across SabiGo ride services and AEKO's blockchain infrastructure, including testnet recovery.",
  },
  {
    position: "Full-Stack Developer",
    company: "ADPDigitek",
    companyLink: "https://github.com/ADP-DIGITEK",
    duration: "March 2025 to July 2026",
    address: "Mallorca, Spain (Remote)",
    work: "Build frontend and backend features that turn product requirements into dependable customer journeys and maintainable APIs.",
  },
  {
    position: "Full-Stack Developer",
    company: "GlobalAcademies",
    companyLink: "https://www.global-academies.com",
    duration: "Jul 2024 to Jan 2025",
    address: "Georgia, United States (Remote)",
    work: "Built USMLE Focus exam-preparation features, including question rephrasing and more usable learning workflows.",
  },
  {
    position: "Backend Developer",
    company: "Memoapps Limited",
    companyLink: "https://github.com/MemoApps",
    duration: "Sep 2023 to Jun 2024",
    address: "Chennai, India (Remote)",
    work: "Developed communication-service APIs, authentication and data-access workflows, with attention to reliability and caching.",
  },
  {
    position: "Full-Stack Developer",
    company: "Kinpeak Limited",
    companyLink: "https://github.com/kinpeak",
    duration: "Sep 2021 to Aug 2023",
    address: "Ibadan, Nigeria",
    work: "Built real-time APIs and asynchronous workflows using WebSockets, Redis and RabbitMQ; investigated data-access bottlenecks.",
  },
  {
    position: "Backend Developer Intern",
    company: "Adroit Solutions",
    duration: "Feb 2021 to Aug 2021",
    address: "Lagos, Nigeria",
    work: "Built backend endpoints and integrations using Django, Flask and Node.js, collaborating on client-facing delivery.",
  },
];

// ── Education ────────────────────────────────────────────
export const education = [
  {
    position: "B.Tech, Mechatronics Engineering",
    company: "Federal University of Technology",
    companyLink: "https://futminna.edu.ng",
    duration: "",
    address: "Minna, Niger State, Nigeria",
    work: "Mechatronics training in control systems and embedded computing informs my systems-oriented engineering approach.",
  },
];

