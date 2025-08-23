# 📰 News-In-kB

**News-In-kB** is a real-time AI-powered news aggregator that fetches articles from multiple sources, scrapes full content, and generates concise summaries.  
Built with **Node.js, Express, MongoDB, EJS**, and powered by **Axios, Cheerio, and OpenAI/Groq**, it delivers fresh, clean, and minimalistic news updates.

🔗 **Live Demo:** [News-In-kB](https://news-in-kb.up.railway.app/)  
📂 **GitHub Repo:** [GitHub](https://github.com/shshnkch/News-In-kB)

---

## 🚀 Features

- Fetches articles via **RSS feeds** from multiple news websites
- Scrapes **full content & images** using `Axios` + `Cheerio`
- Generates **AI-powered summaries** (~100 words) with OpenAI/Groq
- **Hourly background jobs** fetch and update latest news
- Stores clean & structured articles in **MongoDB**
- Minimalistic **EJS-based frontend** with swipe & navigation
- Displays **fresh news only** (auto-deletes after 24 hours)
- **Pagination & caching** for performance optimization

---

## 🛠️ Tech Stack

- **Backend**: Node.js, Express.js  
- **Frontend**: EJS, CSS (responsive design)  
- **Database**: MongoDB (Mongoose ODM)  
- **Scraping**: Axios, Cheerio  
- **AI Summarization**: OpenAI / Groq  
- **Scheduling**: Node-Cron  
- **Deployment**: Railway  

---
