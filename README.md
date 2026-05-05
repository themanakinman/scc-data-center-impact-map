[![Review Assignment Due Date](https://classroom.github.com/assets/deadline-readme-button-22041afd0340ce965d47ae6ef1cefeee28c7c493a6346c4f15d667ab976d596c.svg)](https://classroom.github.com/a/DLw1Zp-y)
# Data Center Community Impact Visualization


This project visualizes how data centers affect surrounding communities in Silicon Valley, focusing on **infrastructure load, environmental impact, and community vulnerability**. It provides interactive tools to explore how resource-intensive infrastructure is distributed and whether it disproportionately impacts certain populations.

---

## Demo

- **Live Site:** https://dsci-554.github.io/project-team-22/
- **Figma Wireframe:** https://www.figma.com/design/2VL8D660ZQD2xvxNEMLUZF/Mapping-Silicon-Valley-Wireframe?node-id=1-2&t=30peeaK9mJY80U0w-1

---

## Tech Stack

- **Frontend:** Vue 3, Vite  
- **Styling:** Bootstrap  
- **Mapping:** MapLibre GL 
- **Data Processing:** Python (GeoPandas, OSMnx)  

---

## Features & Contributions

### 1. Adding a Data Center (Contribution 1)

- Scenario: An **urban planner** needs to approve a new data center without overloading a region  
- Users can **add a data center point directly on the map**  
- The system dynamically updates the **reachability / impact visualization**  
- Helps visualize how **infrastructure load (MW output)** affects surrounding areas  
- Enables exploration of **what-if scenarios** for infrastructure placement  

---

### 2. Comparing Regions (Contribution 2)

- Scenario: **Urban planners and policy analysts** want to ensure equitable distribution of infrastructure  
- Users can **select two regions (groups of census tracts)** directly on the map  
- The system aggregates and compares:
  - Number of data centers  
  - Total energy load (MW)  
  - Average income  
  - Average vulnerability  
- Displays results in a **side-by-side comparison panel**  
- Helps identify **disparities across communities** and assess whether vulnerable areas are disproportionately impacted  

---

### 3. Checking House Prices (Contribution 3)

- Scenario: **Prospective homeowners** want to understand how nearby data centers affect property values  
- Users can select a location to view **home value trends over time**  
- Displays a **time vs. cost line graph** for high-impact areas  
- Helps evaluate the **economic impact of infrastructure proximity**  

---

### Core Visualization Layer

- **Bivariate Choropleth Map**
  - Encodes **median income (ACS)** and **social vulnerability (SVI)**  
  - Uses a **3×3 color scheme** to highlight at-risk communities  
  - Provides spatial context for all interactions  

---

### Interaction & Design Techniques

- **Linked Views:** Map interactions dynamically update panels and metrics  
- **Spatial Analysis:** Point-in-polygon mapping of data centers to regions  
- **Dynamic Simulation:** Real-time recalculation of impact when adding/removing data centers  
- **User-driven Interaction:** Region selection and comparison workflows  

---

## Design Techniques Used

- **Bivariate Choropleth Mapping**  
- **Linked Views (Map ↔ Panel Interaction)**  
- **Spatial Analysis (Point-in-Polygon)**  
- **Dynamic Simulation (Heatmap recalculation)**  
- **User-driven interaction (region selection)**  

---

## Use Cases

- **Urban Planners:** Evaluate equitable placement of data centers  
- **Policy Analysts:** Identify disproportionate infrastructure burden  
- **Prospective Homeowners:** Understand environmental and economic impact  

---

## Limitations

- Does not account for dynamic environmental factors (e.g., wind, time-of-day)  
- Heat impact is modeled, not physically simulated  
- Results depend on region selection granularity  

---

## How to Run Locally

### 1. Frontend Setup

```bash
cd app-ui
npm install
npm run dev
```

### 2. Python Backend Setup (Required for Dynamic Features)

Required for:
Adding/removing data centers
Recomputing heatmap

```bash
cd app-ui
npm run setup-python
```

This creates a virtual environment in ../scripts/venv and installs dependencies such as:
- osmnx
- geopandas

---

## Project Structure 
app-ui/src/components/BaseMap.vue → Core map logic
app-ui/src/components/MapPanel.vue → Choropleth UI + insights
app-ui/src/components/Sidebar.vue → Layer descriptions
app-ui/src/utils/ → Data + geographic helpers
scripts/ → Python processing for heatmap generation

---

## Team
- Samruddhi Kale
- Jhene Ekuwem
- Michael Kim
- Lucero Rodriguez

## Summary

This project transforms spatial data into an interactive decision-support system, enabling users to explore, simulate, and compare infrastructure impacts across communities, with a focus on equity and sustainability.
