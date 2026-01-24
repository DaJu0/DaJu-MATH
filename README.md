# DAMA PRO: Online P2P Checkers

A professional-grade, mobile-optimized Dama (Checkers) game featuring real-time global P2P multiplayer and Gemini-powered strategy assistance.

## 🚀 Deployment Instructions for GitHub

To host this game on GitHub for free using GitHub Pages:

### 1. Create the Repository
- Log in to your GitHub account.
- Create a new repository (e.g., named `dama-pro`).
- Keep it "Public" so you can use GitHub Pages for free.

### 2. Upload the Files
- Upload all the files in this project directory directly to the **root** of your new repository. 
- Ensure `index.html` is at the very top level (not inside a folder).

### 3. Enable GitHub Pages
- In your GitHub repository, go to **Settings** > **Pages**.
- Under **Build and deployment** > **Branch**, select `main` (or `master`) and the folder `/ (root)`.
- Click **Save**.
- Within a few minutes, GitHub will provide a link like `https://your-username.github.io/dama-pro/`.

### 4. P2P Global Play
- Since this uses PeerJS for P2P connectivity, the "Host" creates a unique 6-character code.
- Your opponent enters that code from anywhere in the world to connect directly to your session.

## 🤖 AI Assistant (CHIKAHAN)
The "CHIKAHAN" chat uses the Google Gemini API to provide real-time strategy tips and game analysis. Note that in a production GitHub Pages environment, you would typically use a proxy or a backend to handle API keys securely, as client-side environment variables (`process.env.API_KEY`) are generally injected during a build process.

## 📱 Mobile Support
This app is designed as a Progressive Web App (PWA) candidate. It fits perfectly on Android and iOS screens and supports "Add to Home Screen" for a full-screen, native-like experience.
