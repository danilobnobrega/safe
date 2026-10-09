# GENERIC — Site Map v0.1

**Concept:** one-man web studio. Copy insists the site is plain / effortless / nothing special.
The site is a virtuoso circus. Each page is its own complete authorial universe with no
stylistic relationship to its neighbours. The only threads: the deadpan copy voice + a few
brutally constant elements.

**References for calibration (not to copy):**
- sketch.london → the STRUCTURE. Disconnected rooms, each a closed world, held by vibe not grid.
- resn.co.nz → the ATTITUDE. World-class craft worn as a joke. "We don't care and it came out perfect."

**The rule that cannot break:** the screen is a circus, the tone is an HR form. Nothing winks.

---

## PERSISTENT (every room, identical)

- **Wordmark** "GENERIC" top-left. Browser-default font. Zero styling. Never moves.
- **Cookie banner** — never dismissable. "We use cookies. Not to track your soul across the
  internet, but because the web browser freaks out if we don't put this banner here."
  `[ ACCEPT COOKIES ]  [ I PREFER BISCUITS ]`
  → "I PREFER BISCUITS" swaps every "cookie" on the site to "biscuit" and drops a low-poly
    biscuit into whatever physics scene you're currently in.
- **The Loader** between rooms — a default spinner + one deadpan line, different each time
  ("this should be instant" / "loading things" / "almost" / "why is this taking so long,
  it's just a website"). This is the one consistent transition. Also the anchor.
- **Footer** shows the domain as-is: `generic.bargains`

**Tech:** Three.js vanilla + custom GLSL · GSAP + ScrollTrigger + Lenis · Rapier (physics rooms)
· Web Audio · one shared render loop · WebGL context persists across navigation · every room
has a `prefers-reduced-motion` fallback.

---

## HERO — "The Blank Page"

The one calm surface. Generic = understated, familiar, near-empty. But nonsense underneath.

- A single WebGL plane floating in an off-white void — a blank sheet / a blank browser page.
- Printed on it, deadpan: **GENERIC. We do things for people.**
- Scattered on the surface: the **doors** — small anomalies that have no business being there
  and no relationship to each other. Each door is a fragment of the room it leads to, already
  alive on the other side, bleeding through the surface when you approach.
- **Cursor:** a default arrow — but 3D, with weight, inertia, casts a shadow. Near a door it
  morphs into that room's cursor (a preview / infection).
- **Navigation:** approach door → surface tears/warps → Loader → room.

---

## THE ROOMS

### 1. SERVICES — "The Spinning Logo"
- **Copy:** software / coding / maintenance / consulting. "we write words that computer
  understand so your computer does the thing." Gag: "make the logo spin in 3D → it spins.
  It looks terrible, but you asked for it."
- **Universe:** pristine white product-showcase room, Apple-page lighting, one object on a
  pedestal, slow rotation, HDRI, DOF. The object is a hideous chrome wordmark "GENERIC".
  Each service = a "variant" you select; the object morphs into an equally ugly form.
- **Game:** grab the logo, spin it, throw it. Physics. It knocks the pedestal over.
  A small "please don't" appears.
- **Door:** the spinning 3D logo anomaly.
- **Cursor:** orbit / rotate.

### 2. FAQ — "The Accordion"
- **Copy:** the FAQ Q&As. "Do you use Agile or Waterfall? We work on it until it is finished."
  "this page loaded in 0.00001 seconds. You are welcome."
- **Universe:** an actual accordion (the instrument), 3D, filling the screen. Each question is
  a fold in the bellows. Expanding a question physically pulls it open; it wheezes a note.
  More questions open = more distended and absurd. Answers printed on the folds.
- **Game:** play it. Keyboard = notes. Hidden song.
- **Door:** one accordion fold peeking through a slit in the surface.
- **Cursor:** a hand that pulls.

### 3. CASE STUDIES — "The Observatory"
- **Copy:** "Client X had a problem. We made a solution. Client X made money. End of study."
- **Universe:** a dark WebGL sky. Each case study is a scatter of stars. You drag to connect
  the dots (problem → solution → money). Constellation completes → a flat sentence types out.
  Parallax star depth, nebula particles.
- **Game:** connect-the-constellation.
- **Door:** a single pinhole of light in the surface.
- **Cursor:** a telescope reticle.

### 4. SOCIAL PROOF — "The Logo Pile"
- **Copy:** Trusted by "A Company", "Another Company", "A Third, Slightly Larger Company".
  Testimonial: "I gave them money. They gave me software. The software functions." — John, Person.
- **Universe:** physics sandbox. Generic corporate logos (a circle, a swoosh, "A COMPANY" in
  Helvetica) as heavy 3D slabs in a gravity heap. "A Third, Slightly Larger Company" is
  slightly larger and crushes the rest. Testimonials engraved on the backs.
- **Game:** stack them / knock the pile over.
- **Door:** one logo slab lying flat on the surface.
- **Cursor:** a claw grabber.

### 5. PITCH DECK — "The Presentation"
- **Copy:** "OUR SOFTWARE WORKS AND YOUR CURRENT SOFTWARE DOES NOT." (End of Presentation.
  Questions?)
- **Universe:** a fullscreen slide deck in the Google-Slides default theme (the one genuinely
  "generic" visual) — but each transition is a cinematic 3D camera move through a physical
  space where the slides are giant monoliths. The "default template" is a lie; it's a world.
- **Game:** click "Questions?" → infinite loop of deadpan non-answers.
- **Door:** a projector rectangle of light on the surface.
- **Cursor:** a red laser dot.

### 6. THE PROCESS — "The Machine"
- **Copy:** STEP 1–6. "STEP 3: You give us half the money." "If Step 3 does not happen,
  Step 4 will also not happen."
- **Universe:** a Rube Goldberg machine / conveyor, side-scroll parallax, physics. A coin
  drops in at STEP 1 and travels through contraptions. At STEP 3 a gate: if you don't
  "insert coin" (click), the whole machine freezes and a sign lowers:
  "Step 4 will also not happen."
- **Game:** a marble-run you feed.
- **Door:** a single gear turning at the edge of the surface.
- **Cursor:** a coin.

### 7. TEAM — "The Busts"
- **Copy:** CEO Dave (owns a laptop). CTO (drinks coffee, types faster). Lead Designer
  (complains about kerning). Head of HR (does not exist). Core Values: Integrity, Speed,
  Excellence.
- **Universe:** a corporate "About Us" team grid — 4 headshot cards — but each headshot is
  the same low-poly 3D bust with a different prop (laptop / coffee / glasses / empty plinth
  for HR). Eyes track your cursor. Hover → recites its bio in a flat TTS voice. HR is an
  empty pedestal; hovering does nothing, forever.
- **Game:** rotate the busts, swap their props (put the coffee on Dave, he becomes CTO).
- **Door:** a floating low-poly head. On the hero its eyes already follow your cursor.
- **Cursor:** default (the busts do the work).

### 8. TERMS & SCOPE — "The Fine Print"
- **Copy:** "What You Think You Signed / What You Actually Signed." "Unlimited revisions →
  2 revisions. After that we charge you for every breath we take in your presence." + Scope
  Policy table + the "What You Ask For / What Actually Happens / Cost" table.
- **Universe:** an infinite legal document — one column of text receding to a vanishing point
  in 3D, parallax scroll. As you scroll, the human-readable translation bleeds up through the
  legalese (two depth layers). At the bottom: a signature field. Sign it (draw with cursor)
  → stamp: "TOO LATE."
- **Game:** draw your signature, it gets judged.
- **Door:** a line of tiny unreadable text on the surface.
- **Cursor:** a fountain pen.

### 9. CHECKOUT — "Pay Money / Do Not Pay Money"  ← the climax / the CTA
- **Copy:** `[Pay Money]  [Do Not Pay Money]`. "THINK ABOUT WHAT YOU'VE DONE." "SUCCESS.
  You have successfully paid money. We have received the money. A invoice has been sent to
  your inbox. It contains numbers."
- **Universe:** a Stripe-perfect checkout screen floating in a void, real depth and
  materiality (the card is a real object). Two buttons.
  - **Pay Money** → slow ceremonial SUCCESS. Confetti of tiny invoices. A receipt prints
    from the bottom edge as a real 3D paper strip you pull — endless, covered in nonsense
    numbers. Resolves to the real `[ EMAIL US ]`.
  - **Do Not Pay Money** → screen goes black. One button: "THINK ABOUT WHAT YOU'VE DONE."
    Click → back to checkout. Loop.
- **Door:** the two tiny buttons side by side — the only interactive text on the hero.
- **Cursor:** a credit card.

---

## OPEN DECISIONS

1. **Framework:** Next.js multi-page vs SPA with a custom router + persistent canvas.
   (Persistent WebGL context across rooms wants care either way.)
2. **Room count for v1:** 9 is a lot. Candidate cut to 7: fold CASE STUDIES into SOCIAL PROOF,
   fold CORE VALUES fully into TEAM. Or ship 5 and add rooms as "new generic products".
3. **Hero door previews:** each needs its room's scene at least partially preloaded → perf
   budget. Maybe previews are cheap 2D/video stand-ins, full scene loads on entry.
4. **Mobile / reduced-motion:** can't run 9 WebGL worlds on a phone. Needs a real plan —
   a deadpan text-only "mobile version" is itself on-brand ("you are on a phone. the website
   is smaller now.") but each room still needs a fallback.
5. **Transition:** confirm the Loader-between-rooms model, or something more violent.
6. **Sound:** on by default (with a mute) or off by default? Accordion room needs it.
