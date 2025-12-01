# Product Design Workflow

This is a Next.js application that uses the Laozhang API to design products based on user-uploaded images.

## Features

- **Image Analysis**: Uses `gemini-3-pro-preview` to identify subjects and generate creative prompts.
- **Product Generation**: Uses `gemini-3-pro-preview-thinking` to generate high-quality product images in parallel.
- **Customizable**: Choose which products to generate (Hoodie, Phone Case, etc.).

## Setup

1.  **Install Dependencies**:
    ```bash
    npm install
    ```

2.  **Environment Variables**:
    Create a `.env.local` file in the root directory and add your API key:
    ```env
    LAOZHANG_API_KEY=your_laozhang_api_key_here
    ```

3.  **Run Development Server**:
    ```bash
    npm run dev
    ```

4.  **Open**:
    Visit [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

- `app/page.tsx`: Main UI logic.
- `app/api/analyze/route.ts`: Image analysis endpoint.
- `app/api/generate/route.ts`: Image generation endpoint.






