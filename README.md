CLOSIRA FULLSTACK: AI ENQUIRY PIPELINE & DASHBOARD

OVERVIEW

This project is a production-oriented MVP for an AI-powered business assistant
designed for small and medium businesses. I have architected a two-tier system
consisting of a high-performance Python backend for data processing and a React
Native mobile dashboard for real-time monitoring.

BACKEND ARCHITECTURE

  - Framework: Built with FastAPI for its native asynchronous capabilities and
    superior speed.
  - Async Pipeline: Implemented FastAPI BackgroundTasks to ensure the API
    returns a Job ID immediately to the client while the logic engine processes
    the message in the background.
  - Database: Utilized SQLAlchemy with a SQLite provider for a portable and
    reliable relational data store.
  - Operational Visibility: Developed a custom JSON logging formatter to ensure
    all system events (enquiry creation, SOP matching, and escalations) are
    ready for professional log aggregation tools.

FRONTEND ARCHITECTURE

  - Framework: Developed using React Native and the latest Expo SDK 56.
  - UI/UX Logic: Built a responsive mobile dashboard featuring real-time status
    badges and persistent state management using mock data.
  - Routing: Implemented a Stack-based navigation system to allow owners to
    drill down from lead lists into specific conversation details and
    AI-generated summaries.

ENGINEERING TRADE-OFFS & DECISIONS

  - BackgroundTasks vs Celery: I chose FastAPI BackgroundTasks for this MVP to
    avoid the infrastructure overhead of a Redis broker while maintaining
    non-blocking performance for standard SOP keyword matching.
  - Standard Entry Point: To bypass known module resolution conflicts in the
    latest SDK 56 environment I utilized the standard AppEntry configuration to
    ensure stable UI rendering across web and mobile views.

SETUP AND RUN

BACKEND:

1.  cd Backend
2.  pip install -r requirements.txt
3.  python -m uvicorn app.main:app --reload

FRONTEND:

1.  cd Frontend
2.  npm install
3.  npx expo start --web

DEVELOPER

  - Bhanvi Singh Chauhan: Lead System Architect and Full-Stack Developer