# 🧭 GuideMate

> **SheHacks+ Finalist Project** 🏆
>
> An indoor navigation assistant providing real-time, voice-guided spatial routing for the visually impaired.

## 📖 Overview

GPS has changed the world for the sighted, but for the visually impaired, the world often stops at the front door of a building. What does it feel like to be in an unfamiliar building during a fire alarm, not knowing where the exits or obstacles are? 

For over 2.2 billion people worldwide living with visual impairments, this uncertainty is daily life. 

**GuideMate** challenges how we think about accessibility, safety, and independence in everyday spaces. It is a web-based indoor navigation assistant that adapts dynamically as the user moves through a space. Instead of relying on static solutions like Braille signage or tactile flooring, GuideMate provides continuous, step-by-step audio guidance and obstacle detection in real time.

## ✨ Key Features

*   **Real-Time Voice Interaction:** Users can ask natural language questions like *"Where is the nearest exit?"* and receive immediate, clear audio directions.
*   **Dynamic Obstacle Detection:** Continuously scans the environment to warn users of physical obstacles in their path as they move.
*   **Hardware-Agnostic Accessibility:** Built entirely as a web application. No bulky, specialized hardware is required—just a smartphone or standard device.
*   **Low-Latency Processing:** Deployed on the edge to ensure the fast response times required for safe spatial navigation.

## 🛠️ Technical Architecture

*   **Frontend & Core Logic:** TypeScript
*   **Computer Vision:** COCO-SSD (Real-time object detection)
*   **Spatial Mapping:** LiDAR integration for depth and environmental landmarks
*   **Voice AI:** ElevenLabs (Speech-to-Speech and Text-to-Speech)
*   **Deployment & Hosting:** Cloudflare (Edge computing for lightweight, fast execution)

## 🚀 Getting Started

### Prerequisites
*   Node.js (v18 or higher)
*   npm or yarn
*   ElevenLabs API Key

### Installation

1. Clone the repository:
   ```bash
   git clone [https://github.com/lgomezvi/GuideMate.git](https://github.com/lgomezvi/GuideMate.git)
   cd GuideMate
