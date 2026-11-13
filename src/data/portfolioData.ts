/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface LookArchiveItem {
  id: string;
  title: string;
  subtitle: string;
  kanjiSubtitle: string;
  year: number;
  genre: string;
  occasion: string;
  durationMin: number;
  synopsis: string;
  coverImage: string;
  skinFinish: string;
  eyesTechnique: string;
  lipShade: string;
  hairStyle: string;
  palette: string[];
}

export interface RunwayLookItem {
  id: string;
  lookNum: string;
  title: string;
  subtitle: string;
  image: string;
  description: string;
  elements: {
    name: string;
    type: string;
    details: string;
    price: string;
    iconSvg?: string;
  }[];
}

export interface CategoryCardData {
  id: string;
  name: string;
  tagline: string;
  videoUrl: string;
  fallbackImage: string;
  details: string;
  actionText: string;
}

export interface ServiceItem {
  id: string;
  title: string;
  category: 'bridal' | 'events' | 'education';
  duration: string;
  tagline: string;
  description: string;
  includes: string[];
  recommendedFor: string;
  /** Background photo for the service card (2:3, faces in the top third). */
  image: string;
}

export const BUSINESS_INFO = {
  name: "Deepika Makeup & Hair",
  artist: "Deepika S",
  title: "Atlanta Luxury Makeup Artist & Educator",
  tagline: "Versatile Bridal Artistry · Party Makeup & Hair · Masterclass Atelier",
  location: "Atlanta, GA, USA",
  serviceArea: "Serving Greater Atlanta (Buckhead, Alpharetta, Midtown, Duluth, Dunwoody) & Worldwide Destination Weddings",
  instagram: "https://www.instagram.com/deepikamakeupandhair/",
  instagramHandle: "@deepikamakeupandhair",
  // Two lines, both on WhatsApp and for calls; the US number is the main one.
  // Display text, tel: target (international format, no spaces) and country for each number.
  phonePrimary: "+1 980-497-7720",
  phonePrimaryTel: "+19804977720",
  phonePrimaryCountry: "USA",
  phoneSecondary: "+91 91135 85961",
  phoneSecondaryTel: "+919113585961",
  phoneSecondaryCountry: "India",
  // WhatsApp links need the full international number (country code, no +)
  whatsappUrl: "https://wa.me/19804977720",
  whatsappSecondaryUrl: "https://wa.me/919113585961",
  certification: "Certification valid in 180 countries",
  bio: "Deepika S is an Atlanta-based professional makeup artist and educator specializing in bespoke Indian bridal artistry, contemporary reception glamour, party makeup and hair for all kinds of celebrations, and personalized makeup masterclasses. Renowned for weightless glass-skin bases, customized undertone matching, and intricate hair styling, she brings timeless elegance to every bride and client.",
};

/** Both WhatsApp / phone lines, US first. Every place that offers WhatsApp lists these. */
export const WHATSAPP_CONTACTS = [
  {
    country: BUSINESS_INFO.phonePrimaryCountry,
    number: BUSINESS_INFO.phonePrimary,
    tel: BUSINESS_INFO.phonePrimaryTel,
    url: BUSINESS_INFO.whatsappUrl,
  },
  {
    country: BUSINESS_INFO.phoneSecondaryCountry,
    number: BUSINESS_INFO.phoneSecondary,
    tel: BUSINESS_INFO.phoneSecondaryTel,
    url: BUSINESS_INFO.whatsappSecondaryUrl,
  },
];

// 12 Curated Signature Archive Looks for the 3D Curved Gallery
export const ARCHIVE_LOOKS: LookArchiveItem[] = [
  {
    id: "south-indian-muhurtham",
    title: "Royal Muhurtham",
    subtitle: "TEMPLE BRONZE / 伝統の美",
    kanjiSubtitle: "TEMPLE BRONZE · 伝統の美",
    year: 2026,
    genre: "Traditional Bridal",
    occasion: "Morning Muhurtham Ceremony",
    durationMin: 150,
    synopsis: "Radiant, sweat-resistant matte base with luminous golden undertones, framed by precise kohl-rimmed almond eyes, statement temple jewelry, and an authentic fresh jasmine jada hair weave.",
    coverImage: "/images/portfolio/archive-royal-muhurtham.jpg",
    skinFinish: "Velvet Satin Hydrated Finish",
    eyesTechnique: "Smudged Kohl & 24K Gold Dusting",
    lipShade: "Rich Warm Berry Rose",
    hairStyle: "Traditional Jasmine Flower Jada Braid",
    palette: ["#B8860B", "#800020", "#F5EFEB", "#2A221E"]
  },
  {
    id: "reception-starlight",
    title: "Starlight Reception",
    subtitle: "HOLLYWOOD GLAM / 星影の宴",
    kanjiSubtitle: "HOLLYWOOD GLAM · 星影の宴",
    year: 2026,
    genre: "Couture Reception",
    occasion: "Evening Grand Reception",
    durationMin: 120,
    synopsis: "Ultra-luxurious evening glam pairing sculpted high-beam cheekbones with sultry chocolate-bronze smoky eyes and signature brushed Hollywood waves.",
    coverImage: "/images/portfolio/archive-starlight-reception.jpg",
    skinFinish: "High-Beam Glass Glow",
    eyesTechnique: "Bronze Metallic Smoke & Wispy Mink Lashes",
    lipShade: "Satin Warm Caramel Nude",
    hairStyle: "Sculpted Hollywood Waves with Volume",
    palette: ["#1F382B", "#D4AF37", "#E0A96D", "#1C1815"]
  },
  {
    id: "ivory-heritage-bride",
    title: "Luminous Ivory Bride",
    subtitle: "TIMELESS VOGUE / 白無垢の光",
    kanjiSubtitle: "TIMELESS VOGUE · 白無垢の光",
    year: 2025,
    genre: "Royal Contemporary",
    occasion: "Vows & Mandap",
    durationMin: 140,
    synopsis: "A breathtaking fusion of modern glass skin and regal diamond adornments. Soft winged liner with champagne inner highlights and a dewy petal pout.",
    coverImage: "/images/portfolio/archive-luminous-ivory-bride.jpg",
    skinFinish: "Dewy Silk Skin with Skin-Mimicking Base",
    eyesTechnique: "Soft Micro-Winged Liner & Champagne Shimmer",
    lipShade: "Petal Rose Glaze",
    hairStyle: "Textured Low Bridal Chignon with Soft Tendrils",
    palette: ["#F9F6F0", "#E6C687", "#4A5859", "#2D241E"]
  },
  {
    id: "sangeet-floral-braid",
    title: "Sangeet Euphoria",
    subtitle: "VIBRANT FLORA / 祝祭の夜",
    kanjiSubtitle: "VIBRANT FLORA · 祝祭の夜",
    year: 2025,
    genre: "Festive Sangeet",
    occasion: "Sangeet Dance Night",
    durationMin: 110,
    synopsis: "Designed for effortless movement under stage lights. Radiant flushed peach cheeks, golden bronze shimmer, and an ethereal textured braid woven with delicate baby's breath.",
    coverImage: "/images/portfolio/archive-sangeet-euphoria.jpg",
    skinFinish: "Perspiration-Proof Radiant Glow",
    eyesTechnique: "Warm Bronze Sunset Cut-Crease",
    lipShade: "Glossy Warm Coral Pink",
    hairStyle: "Textured Bubble Fishtail with Baby's Breath",
    palette: ["#E63946", "#F4A261", "#E76F51", "#264653"]
  },
  {
    id: "glass-skin-cocktail",
    title: "Dewy Glass Cocktail",
    subtitle: "MINIMALIST CHIC / 清澄な露",
    kanjiSubtitle: "MINIMALIST CHIC · 清澄な露",
    year: 2024,
    genre: "Modern Cocktail",
    occasion: "Welcome Party & Cocktails",
    durationMin: 90,
    synopsis: "Clean, hyper-hydrated editorial makeup with laminated natural brows, creamy peach cheek wash, and an effortless undone bridal bun.",
    coverImage: "/images/portfolio/archive-dewy-glass-cocktail.jpg",
    skinFinish: "Weightless Water-Drenched Glass Finish",
    eyesTechnique: "Feathered Liner & Fluffy Brow Lamination",
    lipShade: "Bitten Nude Peach Balm",
    hairStyle: "Effortless Messy French Twist Updo",
    palette: ["#FAF0CA", "#0D3B66", "#F95738", "#EE964B"]
  },
  {
    id: "masterclass-atelier",
    title: "Education Atelier",
    subtitle: "PRO MASTERCLASS / 匠の技法",
    kanjiSubtitle: "PRO MASTERCLASS · 匠の技法",
    year: 2024,
    genre: "Makeup Education",
    occasion: "Hands-on Masterclass & 1-on-1",
    durationMin: 240,
    synopsis: "Deepika's educational masterclasses in Atlanta: personalized face mapping, undertone calibration, color correction for deep skin, and professional kit curation.",
    coverImage: "/images/portfolio/archive-education-atelier.jpg",
    skinFinish: "Analytical Skincare Prep & Shade Matching",
    eyesTechnique: "Brush Anatomy & Blending Geometry",
    lipShade: "Custom Color Mixing",
    hairStyle: "Iron Curvature & Setting Science",
    palette: ["#D4AF37", "#3D3A45", "#F7F5F0", "#1C1815"]
  },
  {
    id: "transformation-glow",
    title: "The Signature Metamorphosis",
    subtitle: "TRUE REVELATION / 変容の輝き",
    kanjiSubtitle: "TRUE REVELATION · 変容の輝き",
    year: 2023,
    genre: "Bridal Transformation",
    occasion: "Full Bridal Journey",
    durationMin: 180,
    synopsis: "Before-and-after excellence that never masks personal beauty. Corrective color neutralizing, seamless blending, and tear-proof 16-hour endurance.",
    coverImage: "/images/portfolio/archive-signature-metamorphosis.jpg",
    skinFinish: "Skin-Like Micro-Airbrush Texture",
    eyesTechnique: "Precision Symmetry & Lift Architecture",
    lipShade: "Longwear Transfer-Resistant Velvet",
    hairStyle: "Veil Anchoring & Crown Sculpting",
    palette: ["#9E7D53", "#EAE0D5", "#0A0908", "#5E503F"]
  },
  {
    id: "artist-studio-signature",
    title: "Deepika's Atlanta Studio",
    subtitle: "ATELIER VISION / 美の対話",
    kanjiSubtitle: "ATELIER VISION · 美の対話",
    year: 2023,
    genre: "Atelier Portrait",
    occasion: "Bridal Consultations & Trials",
    durationMin: 90,
    synopsis: "Step into Deepika's Atlanta beauty atelier for bespoke bridal previews, skincare consultations, and customized look designing.",
    coverImage: "/images/portfolio/archive-atlanta-studio.jpg",
    skinFinish: "Customized Skin Hydration Regimen",
    eyesTechnique: "Bespoke Lash Architecture",
    lipShade: "Signature Nuanced Tint",
    hairStyle: "Custom Hairpiece & Saree Drape Planning",
    palette: ["#C5A880", "#2A221E", "#FAF7F2", "#8E7D6B"]
  },
  {
    id: "velvet-mehendi",
    title: "Golden Hour Mehendi",
    subtitle: "WARM TERRACOTTA / 黄昏の彩り",
    kanjiSubtitle: "WARM TERRACOTTA · 黄昏の彩り",
    year: 2022,
    genre: "Traditional Festive",
    occasion: "Afternoon Mehendi Lawn",
    durationMin: 95,
    synopsis: "Sun-drenched terracotta shadows with warm copper flecks, complemented by a dewy golden tint and an effortless boho half-up braid.",
    coverImage: "/images/portfolio/archive-golden-hour-mehendi.jpg",
    skinFinish: "Golden Hour Sunlit Sheen",
    eyesTechnique: "Copper Shimmer Halo Eye",
    lipShade: "Spiced Cinnamon Gloss",
    hairStyle: "Bohemian Half-Up Braid with Gypsophila",
    palette: ["#DDA15E", "#BC6C25", "#283618", "#606C38"]
  },
  {
    id: "classic-heritage-crimson",
    title: "Heritage Crimson",
    subtitle: "ROYAL VERMILION / 紅の継承",
    kanjiSubtitle: "ROYAL VERMILION · 紅の継承",
    year: 2022,
    genre: "Heritage Bridal",
    occasion: "Anand Karaj & Pheras",
    durationMin: 160,
    synopsis: "The timeless imperial red bridal statement. Flawless porcelain-satin canvas, subtle winged cat-eye, and iconic deep ruby crimson lip.",
    coverImage: "/images/portfolio/archive-heritage-crimson.jpg",
    skinFinish: "High-Definition Mattified Radiance",
    eyesTechnique: "Clean Flick Wing with Soft Champagne Cut",
    lipShade: "Pure Royal Ruby Crimson",
    hairStyle: "Structured Low Architectural Bun with Dupatta Pinning",
    palette: ["#990000", "#D4AF37", "#FAF7F2", "#1D1714"]
  },
  {
    id: "emerald-regency-glam",
    title: "Emerald Regency",
    subtitle: "VELVET MIDNIGHT / 翠玉の夜",
    kanjiSubtitle: "VELVET MIDNIGHT · 翠玉の夜",
    year: 2021,
    genre: "High-Fashion Bridal",
    occasion: "Couture Gala & Reception",
    durationMin: 135,
    synopsis: "A dramatic fusion of deep emerald tones, gold reflective micro-shimmer, and full-bodied waves for high-impact photography.",
    coverImage: "/images/portfolio/archive-emerald-regency.jpg",
    skinFinish: "Velvet Satin Complexion",
    eyesTechnique: "Smoky Emerald Wing & Gold Waterline",
    lipShade: "Nude Velvet Mauve",
    hairStyle: "Deep Side Part Glamour Cascade",
    palette: ["#0B3B24", "#C5A880", "#212529", "#E9ECEF"]
  },
  {
    id: "editorial-runway-glow",
    title: "Editorial Silk",
    subtitle: "HIGH COUTURE / 絹の光彩",
    kanjiSubtitle: "HIGH COUTURE · 絹の光彩",
    year: 2020,
    genre: "Fashion & Editorial",
    occasion: "Bridal Magazine Spread",
    durationMin: 100,
    synopsis: "Clean, sculptural, and modern. Skin that breathes with luminosity, brushed upward brows, and micro-fine hair detailing.",
    coverImage: "/images/portfolio/archive-editorial-silk.jpg",
    skinFinish: "Featherlight Micro-Dew",
    eyesTechnique: "Glossy Lid Glaze with Natural Wisps",
    lipShade: "Sheer Nude Lip Oil",
    hairStyle: "Sleek Modern High Chignon",
    palette: ["#E7DFD6", "#1D1714", "#C5A880", "#F5EFEB"]
  }
];

// 6 Runway Depth Lookbook Looks (matching the Maison Vell runway depth mechanics)
export const RUNWAY_LOOKS: RunwayLookItem[] = [
  {
    id: "runway-look-1",
    lookNum: "01",
    title: "The Royal Muhurtham",
    subtitle: "Kanchipuram Silk & Temple Adornments",
    image: "/images/portfolio/runway-01-royal-muhurtham.jpg",
    description: "Deepika's hallmark South Indian bridal vision: balanced warm undertones, sweatproof matte-satin longevity for 4-hour sacred rituals, and authentic fresh mallipoo jasmine floral styling.",
    elements: [
      { name: "Hydrating Skincare Prep", type: "Base", details: "Hyaluronic infusion & pore-blurring primer for humid weather", price: "Custom" },
      { name: "Temple Kohl Eye Architecture", type: "Eyes", details: "Waterproof deep black gel smudged with antique gold pigment", price: "Bridal Signature" },
      { name: "Fresh Jasmine Floral Jada", type: "Hair", details: "Multi-tiered authentic flower pinning with antique billai", price: "Handcrafted" },
      { name: "Deep Rosewood Satin Lip", type: "Lip", details: "Custom 3-shade contouring for fullness and longevity", price: "Custom Blend" }
    ]
  },
  {
    id: "runway-look-2",
    lookNum: "02",
    title: "The Starlight Reception",
    subtitle: "Emerald Velvet & Hollywood Waves",
    image: "/images/portfolio/runway-02-starlight-reception.jpg",
    description: "Dramatic evening glamour engineered for flash photography and reception spotlights. Soft sculpted cheekbones, deep bronze smoked eyes, and flawless Hollywood wave hair.",
    elements: [
      { name: "High-Beam Bone Sculpting", type: "Complexion", details: "Cream contour with micro-pearl liquid highlight setting", price: "Included" },
      { name: "Smoky Cocoa-Bronze Lids", type: "Eyes", details: "Smoky gradient layered with multidimensional champagne spark", price: "Bridal Signature" },
      { name: "Textured Hollywood Cascade", type: "Hair", details: "Heat-shielded brushed curls locked for 12 hours of dancing", price: "Pro Styling" },
      { name: "Velvet Toffee Gloss Lip", type: "Lip", details: "High-comfort non-sticky formula that withstands dinner & drinks", price: "Custom Blend" }
    ]
  },
  {
    id: "runway-look-3",
    lookNum: "03",
    title: "The Luminous Ivory Veil",
    subtitle: "Royal Heritage & Micro-Shimmer",
    image: "/images/portfolio/runway-03-luminous-ivory-veil.jpg",
    description: "Contemporary elegance in pure ivory and champagne gold. A weightless foundation veil that reveals natural skin texture while achieving camera-ready perfection.",
    elements: [
      { name: "Glass-Veil Skin Technology", type: "Base", details: "Ultra-fine pigment dispersion with breathable skin finish", price: "Signature" },
      { name: "Micro-Wing & Diamond Glow", type: "Eyes", details: "Subtle feline flick paired with delicate rose-gold inner corner", price: "Included" },
      { name: "Crown Setting & Dupatta Pinning", type: "Drape", details: "Weightless double-veil anchoring for heavy bridal lehengas", price: "Master Technique" },
      { name: "Petal Glaze Nude Lip", type: "Lip", details: "Blended neutral nude complementing all skin undertones", price: "Custom Blend" }
    ]
  },
  {
    id: "runway-look-4",
    lookNum: "04",
    title: "Sangeet Radiant Euphoria",
    subtitle: "Sunset Bronze & Textured Braid",
    image: "/images/portfolio/runway-04-sangeet-euphoria.jpg",
    description: "Celebratory, vibrant, and photogenic. Infused with warm peach tones, sparkling sunset lids, and a romantic textured braid woven with delicate blooms.",
    elements: [
      { name: "Sweat-Resistant Setting Veil", type: "Base", details: "Proprietary layering method for intensive dance performances", price: "Included" },
      { name: "Sunset Gold Halo Eye", type: "Eyes", details: "Copper-rose gradient with 3D reflective center lid placement", price: "Included" },
      { name: "Textured Fishtail Braid", type: "Hair", details: "Volumized airy weave accented with baby's breath and pearls", price: "Included" },
      { name: "Warm Coral-Rose Moisture Tint", type: "Lip", details: "Long-lasting hydration and buoyant color vibrancy", price: "Included" }
    ]
  },
  {
    id: "runway-look-5",
    lookNum: "05",
    title: "Modern Glass Skin Cocktail",
    subtitle: "Clean Atelier & Textured Updo",
    image: "/images/portfolio/runway-05-glass-skin-cocktail.jpg",
    description: "The epitome of modern luxury: fresh, youthful, and luminous. Features natural feathered brows, translucent dewy blush, and a chic relaxed updo.",
    elements: [
      { name: "Skin Hydration Priming", type: "Prep", details: "Botanical lipid mist and lymphatic drainage face prep", price: "Included" },
      { name: "Feathered Brow Architecture", type: "Brows", details: "Individual micro-stroke filling and flexible brow lamination", price: "Included" },
      { name: "Messy French Romance Bun", type: "Hair", details: "Soft face-framing tendrils with effortless Parisian texture", price: "Included" },
      { name: "Hydrating Peach Nectar Balm", type: "Lip", details: "Nourishing peptide tint for high-shine natural elegance", price: "Included" }
    ]
  },
  {
    id: "runway-look-6",
    lookNum: "06",
    title: "Bridal Transformation Master",
    subtitle: "Skin Enhancement & Symmetric Geometry",
    image: "/images/portfolio/runway-06-bridal-transformation.jpg",
    description: "Before-and-after excellence by Deepika S. Showing how targeted color correction, skin prep, and structural styling accentuate individual beauty without heavy caking.",
    elements: [
      { name: "Targeted Color Correction", type: "Skin", details: "Peach/orange neutralizing for dark circles and hyperpigmentation", price: "Signature" },
      { name: "Facial Symmetry Balancing", type: "Artistry", details: "Precision brow alignment and eye socket dimensional contouring", price: "Signature" },
      { name: "16-Hour Tearproof Lock", type: "Longevity", details: "Multi-barrier sealant resistant to emotion, humidity, and heat", price: "Signature" },
      { name: "Saree Pleat & Box Folding", type: "Drape", details: "Pin-straight crisp silk saree box pleating for regal posture", price: "Signature" }
    ]
  }
];

// 3 Cinematic Categories with Vertical Typography & Video
export const CINEMATIC_CATEGORIES: CategoryCardData[] = [
  {
    id: "bridal",
    name: "bridal couture",
    tagline: "SACRED RITUALS · PHERAS · RECEPTION",
    videoUrl: "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260518_203023_87a26602-2898-4acc-a396-c7a2b5ad84fd.mp4",
    fallbackImage: "/images/portfolio/category-bridal-couture-video.jpg",
    details: "Bespoke bridal packages for South Indian Muhurtham, North Indian Pheras, Fusion weddings, and Grand Receptions across Atlanta and luxury destinations.",
    actionText: "explore bridal couture"
  },
  {
    id: "event-hair",
    name: "beauty & hair",
    tagline: "PARTIES · HOLLYWOOD WAVES · SANGEET",
    videoUrl: "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260518_203415_b86e3f19-2aec-46cd-9a86-b64c40118e38.mp4",
    fallbackImage: "/images/portfolio/category-beauty-hair-video.jpg",
    details: "High-definition makeup and sculptural hair styling for sangeets, cocktail soirees, engagement ceremonies, photoshoots, and gala evenings.",
    actionText: "explore beauty & hair"
  },
  {
    id: "education",
    name: "masterclasses",
    tagline: "1-ON-1 ATELIER · PRO ARTIST CERTIFICATION",
    videoUrl: "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260518_203051_85fee398-ea01-4aa0-972b-137a74213be5.mp4",
    fallbackImage: "/images/portfolio/category-masterclasses-video.jpg",
    details: "Hands-on self-makeup classes for personal mastery, and intensive bridal masterclasses for aspiring artists in our Atlanta beauty atelier.",
    actionText: "explore masterclasses"
  }
];

// Comprehensive Service Offerings
export const SERVICES: ServiceItem[] = [
  {
    id: "bridal-muhurtham",
    image: "/images/portfolio/svc-bridal.jpg",
    title: "Bridal Makeup & Hair",
    category: "bridal",
    duration: "2.5 – 3 Hours",
    tagline: "Complete bridal look for your wedding ceremony",
    description: "Complete bridal makeup and hair for your wedding, made to last through long rituals.",
    includes: [
      "Skin prep before makeup",
      "Long-lasting, sweat-resistant makeup",
      "Hairstyle: jasmine jada, bun or updo",
      "Saree draping",
      "Jewelry, maang tikka and dupatta setting"
    ],
    recommendedFor: "South Indian, Telugu, Tamil, Kannada and North Indian brides."
  },
  {
    id: "bridal-reception",
    image: "/images/portfolio/svc-reception.jpg",
    title: "Reception Makeup & Hair",
    category: "bridal",
    duration: "2 – 2.5 Hours",
    tagline: "Glamorous evening look for your reception",
    description: "A glamorous evening look for your reception that looks great on stage and in photos.",
    includes: [
      "Full glam makeup with contouring",
      "Lashes and eye makeup to match your outfit",
      "Hairstyle: waves, curls or updo",
      "Lehenga dupatta setting"
    ],
    recommendedFor: "Receptions, sangeet and evening wedding events."
  },
  {
    id: "party-makeup",
    image: "/images/portfolio/svc-party.jpg",
    title: "Party Makeup",
    category: "events",
    duration: "1 – 1.5 Hours",
    tagline: "Makeup and hair for all kinds of parties",
    description: "Makeup and hair for all kinds of parties, from a soft natural look to full glam, matched to your outfit.",
    includes: [
      "Natural or full glam makeup",
      "Lashes and lip color to match your outfit",
      "Hairstyle: curls, bun or braid",
      "Saree or dupatta draping (on request)"
    ],
    recommendedFor: "Wedding guests and family, birthdays, baby showers, festivals and evening parties."
  },
  {
    id: "engagement-party",
    image: "/images/portfolio/svc-engagement.jpg",
    title: "Engagement Makeup & Hair",
    category: "events",
    duration: "1.5 – 2 Hours",
    tagline: "Fresh, glowing look for your engagement",
    description: "A fresh, glowing look for your engagement or roka ceremony.",
    includes: [
      "Glowing, natural-looking skin",
      "Soft glam eye makeup to match your outfit",
      "Hairstyle: updo, half-up braid or soft curls",
      "Saree, gown or lehenga draping help"
    ],
    recommendedFor: "Engagements, roka, court weddings and mehendi."
  },
  {
    id: "self-makeup-class",
    image: "/images/portfolio/svc-self-makeup-class.jpg",
    title: "Self-Makeup Class (1-on-1)",
    category: "education",
    duration: "3 – 3.5 Hours",
    tagline: "Learn to do your own makeup",
    description: "A private, hands-on class where Deepika teaches you to do your own makeup.",
    includes: [
      "Review of your makeup kit and brushes",
      "Skin prep and covering dark spots",
      "A quick everyday look and a party look",
      "Eye makeup: simple to winged and smoky",
      "A shopping list of products that suit you"
    ],
    recommendedFor: "Anyone who wants to do their own makeup with confidence."
  },
  {
    id: "pro-artist-mentorship",
    image: "/images/portfolio/svc-pro-course.jpg",
    title: "Pro Makeup & Hair Course",
    category: "education",
    duration: "1 – 2 Days",
    tagline: "Training for makeup artists",
    description: "Training for makeup artists: bridal makeup, hairstyling, saree draping and business tips.",
    includes: [
      "Live demos on models by Deepika",
      "Makeup for different skin tones",
      "Hairstyling and saree draping practice",
      "Pricing, bookings and Instagram tips",
      "Certificate valid in 180 countries"
    ],
    recommendedFor: "New and working makeup artists."
  },
  {
    id: "birthday-makeup",
    image: "/images/portfolio/svc-birthday.jpg",
    title: "Birthday Makeup",
    category: "events",
    duration: "1 – 1.5 Hours",
    tagline: "Look your best on your birthday",
    description: "Makeup and hair for your birthday party or birthday photoshoot, from a soft natural look to full glam.",
    includes: [
      "Natural or full glam makeup",
      "Lashes and lip color to match your outfit",
      "Hairstyle: curls, waves or a bun",
      "Camera-ready finish for birthday photos"
    ],
    recommendedFor: "Birthday parties, milestone birthdays and birthday photoshoots."
  },
  {
    id: "photoshoot-editorial",
    image: "/images/portfolio/svc-photoshoot.jpg",
    title: "Photoshoot Makeup",
    category: "events",
    duration: "1.5 – 2 Hours",
    tagline: "Camera-ready makeup for photoshoots",
    description: "Camera-ready makeup for studio and outdoor photoshoots, planned with your photographer.",
    includes: [
      "HD makeup that looks good in flash photos",
      "Brows and eye makeup",
      "Quick look changes during the shoot",
      "Matte or dewy finish, your choice"
    ],
    recommendedFor: "Bridal portraits, maternity shoots, fashion shoots and family photos."
  }
];

// Real client video reviews. Quotes are only the lines heard clearly in each video (checked with two speech
// models); names are left off until their spelling is confirmed.
export interface VideoTestimonial {
  id: string;
  video: string;
  poster: string;
  /** What the client booked, shown under the quote */
  event: string;
  quote: string;
  /** Describes the video for screen readers */
  description: string;
}

export const VIDEO_TESTIMONIALS: VideoTestimonial[] = [
  {
    id: "reception-bride",
    video: "/images/portfolio/testimonial-red-saree-bride.mp4",
    poster: "/images/portfolio/testimonial-red-saree-bride-poster.jpg",
    event: "Reception Makeup & Hair",
    quote: "I just loved it. I love your work. I've been searching for you since December.",
    description: "Video review from a bride in a red silk saree and gold temple jewellery, talking about her reception look"
  },
  {
    id: "wedding-bride",
    video: "/images/portfolio/testimonial-lakeside-bride.mp4",
    poster: "/images/portfolio/testimonial-lakeside-bride-poster.jpg",
    event: "Bridal Makeup & Hair",
    quote: "It's amazing, thank you so much! … I'm looking so beautiful.",
    description: "Video review from a bride in a peach and gold saree with emerald jewellery, talking about her wedding look by a lake"
  }
];

// Instagram strip (slow auto-scroll). Order is interleaved so similar colors and the same bride
// never sit side by side.
export const INSTAGRAM_HIGHLIGHTS: { id: string; image: string; caption: string; tag: string }[] = [
  { id: "ig-1", image: "/images/portfolio/ig-01-temple-light.jpg", tag: "Traditional Bridal",
    caption: "Timeless South Indian bride bathed in morning temple light. Fresh jasmine & temple jewelry." },
  { id: "ig-lavender-silk", image: "/images/portfolio/ig-lavender-silk.jpg", tag: "Traditional Bridal",
    caption: "Lavender silk and layered temple gold for a serene bridal morning." },
  { id: "ig-tangerine-drape", image: "/images/portfolio/ig-tangerine-drape.jpg", tag: "Bridal Couture",
    caption: "Tangerine silk against a vintage green drape, finished with soft glam." },
  { id: "ig-4", image: "/images/portfolio/ig-04-sangeet-braid.jpg", tag: "Sangeet Hair",
    caption: "Sangeet nights require a braid that can dance until dawn! Pearl & blossom pin details." },
  { id: "ig-lakeside-couple", image: "/images/portfolio/ig-lakeside-couple.jpg", tag: "Couple Portraits",
    caption: "Lakeside portraits with the groom, in soft blush silk." },
  { id: "ig-sage-arches", image: "/images/portfolio/ig-sage-arches.jpg", tag: "Traditional Bridal",
    caption: "Sage and gold silk framed by palace arches." },
  { id: "ig-2", image: "/images/portfolio/ig-02-emerald-waves.jpg", tag: "Reception Glam",
    caption: "Hollywood waves & emerald tones for our stunning Atlanta reception bride. 💚" },
  { id: "ig-classic-red", image: "/images/portfolio/ig-classic-red.jpg", tag: "Traditional Bridal",
    caption: "Classic red bridal silk with a warm, radiant finish." },
  { id: "ig-jasmine-jada", image: "/images/portfolio/ig-jasmine-jada.jpg", tag: "Bridal Hair",
    caption: "A full jasmine jada, pinned for the walk to the mandap." },
  { id: "ig-sapphire-gown", image: "/images/portfolio/ig-sapphire-gown.jpg", tag: "Portraits",
    caption: "A sapphire gown, side-swept curls and luminous evening glam." },
  { id: "ig-plum-silk", image: "/images/portfolio/ig-plum-silk.jpg", tag: "Traditional Bridal",
    caption: "Plum silk saree with layered heirloom gold." },
  { id: "ig-3", image: "/images/portfolio/ig-03-champagne-shimmer.jpg", tag: "Bridal Couture",
    caption: "The magic of subtle champagne shimmer and weightless skin. Booking 2026/2027 brides." },
  { id: "ig-tangerine-full-length", image: "/images/portfolio/ig-tangerine-full-length.jpg", tag: "Editorial",
    caption: "Styled head to toe in tangerine silk and temple jewelry." },
  { id: "ig-bride-and-pup", image: "/images/portfolio/ig-bride-and-pup.jpg", tag: "Candid Moments",
    caption: "The bride and her best boy, just before the ceremony." },
  { id: "ig-ivory-gold", image: "/images/portfolio/ig-ivory-gold.jpg", tag: "Traditional Bridal",
    caption: "Ivory and gold silk with a bold red border and temple gold." },
  { id: "ig-5", image: "/images/portfolio/ig-05-natural-radiance.jpg", tag: "Transformation",
    caption: "Skin that looks like skin. No caking, no heavy mask—just pure natural radiance elevated." },
  { id: "ig-mustard-silk", image: "/images/portfolio/ig-mustard-silk.jpg", tag: "Bridal Couture",
    caption: "Mustard silk and a sculpted, glowing complexion." },
  { id: "ig-ceremony-navy", image: "/images/portfolio/ig-ceremony-navy.jpg", tag: "Ceremony",
    caption: "Navy and marigold silk, ceremony-ready among the rituals." },
  { id: "ig-golden-couple", image: "/images/portfolio/ig-golden-couple.jpg", tag: "Couple Portraits",
    caption: "A quiet moment with the groom in red and gold." },
  { id: "ig-violet-silk", image: "/images/portfolio/ig-violet-silk.jpg", tag: "Bridal Couture",
    caption: "Violet silk saree and soft, defined eyes." },
  { id: "ig-amber-arches", image: "/images/portfolio/ig-amber-arches.jpg", tag: "Traditional Bridal",
    caption: "Amber and gold silk beneath palace arches." },
  { id: "ig-6", image: "/images/portfolio/ig-06-jada-technique.jpg", tag: "Education",
    caption: "Jasmine jada with gold billai, pinned strand by strand — a technique taught in our pro hair mentorship." },
  { id: "ig-ruby-emerald", image: "/images/portfolio/ig-ruby-emerald.jpg", tag: "Bridal Couture",
    caption: "Ruby and emerald silk with statement bridal jewelry." },
  { id: "ig-mint-chaise", image: "/images/portfolio/ig-mint-chaise.jpg", tag: "Editorial",
    caption: "Mint silk on a vintage chaise, styled like an old portrait." },
  { id: "ig-ceremony-rituals", image: "/images/portfolio/ig-ceremony-rituals.jpg", tag: "Ceremony",
    caption: "Family hands, the kalash and fresh mehendi: ceremony-ready." },
  { id: "ig-coral-silk", image: "/images/portfolio/ig-coral-silk.jpg", tag: "Traditional Bridal",
    caption: "Coral silk and warm temple gold." },
  { id: "ig-marigold-mandap", image: "/images/portfolio/ig-marigold-mandap.jpg", tag: "Ceremony",
    caption: "Seated before a wall of marigolds for the ceremony." },
  { id: "ig-gold-silk", image: "/images/portfolio/ig-gold-silk.jpg", tag: "Bridal Couture",
    caption: "Gold silk and a luminous, camera-ready finish." },
  { id: "ig-plum-heirloom", image: "/images/portfolio/ig-plum-heirloom.jpg", tag: "Traditional Bridal",
    caption: "Plum silk against carved doors and heirloom gold." },
  { id: "ig-wine-silk", image: "/images/portfolio/ig-wine-silk.jpg", tag: "Traditional Bridal",
    caption: "Wine and emerald silk with layered temple necklaces." },
  { id: "ig-window-light", image: "/images/portfolio/ig-window-light.jpg", tag: "Portraits",
    caption: "A soft, glowing look in gentle window light." },
  { id: "ig-carved-doors-couple", image: "/images/portfolio/ig-carved-doors-couple.jpg", tag: "Couple Portraits",
    caption: "Newlyweds framed by carved temple doors." },
];
