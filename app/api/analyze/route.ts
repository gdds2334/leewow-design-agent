import { OpenAI } from "openai";
import { NextResponse } from "next/server";

export const maxDuration = 300; // Set to 5 minutes (requires Vercel Pro for >60s)
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    let body;
    try {
      body = await req.json();
    } catch (e) {
      console.error("JSON Parse Error:", e);
      return NextResponse.json({ error: "Invalid JSON body or payload too large" }, { status: 400 });
    }

    // Now expects a single 'product' (string), not 'products' (array)
    // But for backward compatibility or just robustness, we can handle input checking.
    const { image, product, designTheme } = body;

    if (!image) {
      return NextResponse.json({ error: "Image is required" }, { status: 400 });
    }

    const apiKey = process.env.LAOZHANG_API_KEY;
    const baseURL = "https://api.laozhang.ai/v1";

    if (!apiKey) {
        return NextResponse.json({ error: "API Key missing configuration" }, { status: 500 });
    }

    const client = new OpenAI({
      apiKey,
      baseURL,
    });
    
    const targetProduct = product || "Merchandise";
    const baseStyle = "The design style should be fashionable, funny, or interesting.";
    const styleContext = designTheme 
        ? `The design theme MUST be strictly based on: "${designTheme}". ${baseStyle}`
        : baseStyle;

    // Prompt tailored for a SINGLE product
    const prompt = `
      Analyze the uploaded image.
      1. Identify the main subject (person or pet).
      2. Create a UNIQUE, creative design idea based on the subject, specifically for this product: "${targetProduct}".
      3. ${styleContext}
      4. The design should be high-quality, suitable for POD (Print on Demand).
      5. TARGET AUDIENCE: North American market. 
      6. CULTURE & TEXT: Ensure any text or cultural references in the pattern are appropriate for North American culture and MUST be in ENGLISH.
      7. IMPORTANT: The output descriptions themselves (pattern_description and scene_description) MUST be in CHINESE (Simplified Chinese) for the user to understand, BUT if the pattern description includes specific text to be printed on the product, that text should be specified in English.
      8. You must provide TWO parts:
         - "pattern_description": The description of the graphic/pattern itself (e.g., "Cute cat in space suit vector art with text 'SPACE PAWS'").
         - "scene_description": A high-end, photorealistic scene description where this SPECIFIC product ("${targetProduct}") is placed.
      9. Return the result in JSON format with the following structure:
      {
        "subject_description": "Brief description of the subject in Chinese",
        "design": {
            "product": "${targetProduct}",
            "pattern_description": "Pattern description in Chinese...",
            "scene_description": "High-end scene description in Chinese..."
        }
      }
    `;

    console.log(`[Analyze] Starting analysis for product: ${targetProduct} with model: gemini-2.5-pro-thinking`);

    const response = await client.chat.completions.create({
      model: "gemini-2.5-pro-thinking", 
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: {
                url: image, 
              },
            },
          ],
        },
      ],
    });

    const content = response.choices[0].message.content || "";
    console.log("[Analyze] Raw content length:", content.length);
    
    let jsonString = content;
    
    const jsonBlockMatch = content.match(/```json\n?([\s\S]*?)\n?```/);
    if (jsonBlockMatch) {
        jsonString = jsonBlockMatch[1];
    } else {
        const firstBrace = content.indexOf('{');
        const lastBrace = content.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1) {
            jsonString = content.substring(firstBrace, lastBrace + 1);
        }
    }
    
    const parsed = JSON.parse(jsonString.trim());
    
    // Normalize response to match what frontend expects (or update frontend)
    // Frontend previously expected { designs: [] }. 
    // Let's return { designs: [ { ... } ] } containing just this one design to keep it slightly consistent, 
    // or better, just return the design object and handle it in frontend.
    // Let's return `design` object directly as per prompt, but wrap it for clarity if needed.
    // Actually, let's stick to the requested JSON structure in prompt: { subject_description, design: {} }
    
    return NextResponse.json(parsed);

  } catch (error: any) {
    console.error("Analysis Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to analyze image" },
      { status: 500 }
    );
  }
}
