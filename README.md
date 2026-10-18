# VizPilot: Automated Onboarding for SVG-Based Composite Visualizations

VizPilot is a browser extension that automatically generates interactive onboarding experiences for SVG-based composite visualizations using multimodal large language models (LLMs). It helps visualization authors create guided tours that explain visualization components, interactions, and analytical workflows without manually authoring onboarding content.

## Features

- **Automatic onboarding generation** from a visualization description
- **Optional interaction source code** as additional context for explaining interactive behaviors
- **SVG-based component identification** for accurate visual element mapping
- **Interactive spotlight overlay** that highlights relevant visualization components
- **Step-by-step guided walkthroughs** with contextual explanations
- **Onboarding editor** for reviewing and refining generated explanations before deployment

## Installation

1. Open Chrome or Microsoft Edge.
2. Navigate to `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the project directory.

## Usage

1. Open an SVG-based composite visualization in your browser.
2. Click the **VizPilot** extension icon.
   Enter your own **OpenAI API key**. Optionally check **Remember key on this device**; it is saved when you click Generate Onboarding. Use **Forget saved key** to remove it, and refresh open visualization tabs to clear keys already in use.
3. Provide a brief description of the visualization.
4. *(Optional)* Upload the visualization's interaction source code to improve explanations of interactive behaviors.
5. Click **Generate Onboarding**.

VizPilot analyzes the visualization and generates an interactive onboarding sequence directly on the webpage. Authors can review, edit, and deploy the generated onboarding experience.