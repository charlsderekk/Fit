# FitAI — Your Pocket Fitness & Nutrition Coach

FitAI is an AI-powered fitness application built with modern vanilla JavaScript, Vite, and Chart.js, powered by the official Google Gemini API.

## Features

- **Personalized Plan Generation**: Creates tailored workout routines and nutrition macro targets using your profile (age, goal, experience, available equipment, injuries).
- **Adaptive Re-planning**: Analyzes your logged workout consistency and weight trends to adapt your plan over time.
- **AI Coach Chat**: Real-time conversational fitness coach with full context of your current plan and progress.
- **Food Macro Estimator**: Type any meal (e.g., "grilled salmon with sweet potato and broccoli") to estimate calories, protein, carbs, and fat automatically.
- **Progress Tracking & Analytics**: Interactive weight trend and workout volume charts powered by Chart.js.
- **Habit Streaks & Achievements**: Tracks workout consistency streaks and unlocks achievement badges.
- **Scheduled Reminders**: Custom day and time workout reminders with browser notification support.

---

## Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Your Gemini API Key

1. Get a free API key from [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Open the `.env` file in the project root:
   ```env
   VITE_GEMINI_API_KEY=your_actual_gemini_api_key_here
   VITE_GEMINI_MODEL=gemini-flash-latest
   ```
   *(Alternatively, you can click the "Set API Key" pill in the sidebar inside the app to paste your key directly in the browser).*
   The app sends the key to the Gemini API for validation instead of relying on a hard-coded key prefix.

### 3. Run the Development Server
```bash
npm run dev
```

Open [http://localhost:5173/](http://localhost:5173/) (or the port shown in your terminal) in your browser.

### 4. Build for Production
```bash
npm run build
```

---

## Project Structure

```
Fit/
├── .env                  # Your private API key (ignored by git)
├── .env.example          # Environment variable template
├── .gitignore            # Git ignore rules for node_modules and .env
├── index.html            # Main HTML document
├── package.json          # Vite & Chart.js dependencies and scripts
├── vite.config.js        # Vite build configuration
├── src/
│   ├── css/
│   │   └── style.css     # Design system, glassmorphism, responsive styles
│   ├── js/
│   │   ├── auth.js       # Local account reset & auth module
│   │   ├── config.js     # API key resolution (.env & localStorage)
│   │   ├── gemini.js     # Official Gemini REST API service & schemas
│   │   ├── storage.js    # LocalStorage persistence, streak & date math
│   │   └── ui.js         # Navigation, views, charts, and API key modal
│   └── main.js           # App entry point
└── README.md
```