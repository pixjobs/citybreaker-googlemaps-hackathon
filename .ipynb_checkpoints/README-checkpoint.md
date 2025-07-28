# 🏙️ CityBreaker ✈️  
**An AI-powered travel planner that helps you discover and explore your next city break with speed and style.**

🧭 Built for the **Google Maps Platform Awards Hackathon**  
🏆 Categories: **Travel**, **AI**  
🌐 Future Focus: **Immersive Experiences**

---

## 💡 Inspiration

As a passionate traveller planning a trip to South Korea, I wanted to create a tool that combines the intelligence of AI with the visual power of the **Google Maps Platform**. CityBreaker was born out of the desire to make trip planning as intuitive, fast, and delightful as possible—while showcasing what’s possible with modern mapping and frontend technologies.

---

## 🗺️ What It Does

CityBreaker helps you **plan, visualise, and personalise** your next city break with flair:

- 🔍 **Visual City Dashboard**  
  Fly across cities like Tokyo, London, or Seoul with an interactive map that’s fast, fluid, and full of detail.

- 🤖 **AI-Powered Itineraries**  
  Generate multi-day trip plans filled with must-see landmarks, hidden local gems, and authentic experiences—courtesy of Google Gemini AI.

- 🗺️ **Live Map Search**  
  Search for restaurants, landmarks, museums and more directly on the map—without leaving the immersive UI.

- 🎲 **"Surprise Me" Feature**  
  Discover something unique with a single click. AI suggests quirky or unexpected places that match your curiosity.

---

## 📍 Google Maps Platform in Action

CityBreaker is built entirely around the Maps APIs:

- 🗺️ **Maps JavaScript API** – Dynamic, interactive map rendering  
- 📍 **Places API** – Place search with photos, metadata, and reviews  
- 🌐 **Geocoding API** – Translates city names into accurate coordinates  
- 🧱 **(Coming Soon)**: Integration with **Photorealistic 3D Tiles** via Cesium

---

## 🛠️ How It Was Built

CityBreaker uses a modern and highly interactive tech stack designed for performance and beauty:

### 🧩 Frontend
- Next.js + React + TypeScript  
- GSAP (GreenSock) for timeline animations  
- Framer Motion for interactive UI transitions  
- Tailwind CSS for responsive styling

### 🧠 AI & Backend
- Google Gemini 2.5 Pro for in-depth itinerary generation  
- Gemini Flash for quick creative suggestions  
- Custom serverless API (Google Cloud Run) for generating downloadable PDF itineraries

### 🗺️ Mapping
- Maps JS API, Places API, and Geocoding API for map features and search

---

## 🚀 Tech Stack

| Category        | Technologies                                                       |
|-----------------|---------------------------------------------------------------------|
| Framework       | Next.js, React                                                      |
| Language        | TypeScript                                                          |
| Mapping         | Google Maps Platform (Maps JS, Places, Geocoding APIs)             |
| AI              | Gemini 2.5 Pro, Gemini 2.5 Flash                                     |
| Animation       | GSAP, Framer Motion                                                  |
| Styling         | Tailwind CSS                                                        |
| Deployment      | Google Cloud Run                                                    |

---

## ⚙️ Getting Started (Local Dev)

To run locally:

```bash
# 1. Clone the repository
git clone https://github.com/your-username/citybreaker.git
cd citybreaker

# 2. Install dependencies
npm install

# 3. Add environment variables
# Create a `.env.local` file with:
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY="YOUR_GOOGLE_MAPS_API_KEY"
GEMINI_API_KEY="YOUR_GEMINI_API_KEY"

# 4. Start the dev server
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🚧 Challenges We Faced

- 🎯 **AI Prompt Design**  
  Fine-tuning prompts for Gemini to generate structured, creative itineraries took dozens of iterations.

- 🧭 **Map-Integrated Search UX**  
  Building a clean search UI directly over the map required nuanced state and animation handling.

- ⚡ **Performance & Responsiveness**  
  Keeping animations, maps, and data all smooth on a single page required lazy loading, memoization, and timeline tuning.

---

## 🏆 Accomplishments

- ✨ **“Surprise Me” Mode**  
  Adds personality by suggesting off-the-beaten-path places based on user interests (e.g., best ramen for anime fans).

- 📄 **AI-to-PDF Workflow**  
  From Gemini prompt to polished, downloadable PDF—all in a single click.

- 💎 **Unified Design Experience**  
  The integration of mapping, AI, animations, and styling results in a delightful, cohesive user journey.

---

## 🎓 What We Learned

- 🧠 **Match Model to Task**  
  Gemini Pro is ideal for long-form planning; Flash excels at quick creative generation.

- 🧾 **Structured Output Wins**  
  Teaching the AI to return JSON/Markdown made downstream UI rendering and PDF generation seamless.

- 🧠 **Simple UX Requires Smart Architecture**  
  The most elegant features demand careful backend and frontend planning.

---

## 🔭 What’s Next

- 🧱 **Immersive 3D Exploration**  
  Integrate Cesium and Google’s 3D Tiles for a digital-twin experience.

- 🧳 **Saved Trips & Accounts**  
  Let users save itineraries, pin favourite places, and share custom maps.

- 🖼️ **Immersive View API**  
  Bring photorealistic landmark flyovers and previews into the planning workflow.

---

🗺️ CityBreaker is more than just a trip planner—it's your personalised launchpad for unforgettable adventures.  
Built with ❤️ for dreamers, explorers, and map nerds.

