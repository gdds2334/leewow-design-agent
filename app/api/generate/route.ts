import { OpenAI } from "openai";
import { NextResponse } from "next/server";

export const maxDuration = 60; // Increase timeout to 60 seconds
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    let body;
    try {
      body = await req.json();
    } catch (e: any) {
      console.error("Request Body Error:", e.message);
      return NextResponse.json({ error: "Request payload too large or invalid JSON" }, { status: 413 });
    }

    const { prompt, pattern_description, scene_description, image, /* inspirationImage, */ product } = body;

    if ((!prompt && (!pattern_description || !scene_description)) || !image) {
      return NextResponse.json({ error: "Prompt/Description and Image are required" }, { status: 400 });
    }

    // Construct prompt from parts if available
    const fullPrompt = pattern_description && scene_description 
        ? `Design Pattern: ${pattern_description}. High-end Scene Context: ${scene_description}`
        : prompt;

    const apiKey = process.env.LAOZHANG_API_KEY;
    const baseURL = "https://api.laozhang.ai/v1";

    if (!apiKey) {
      console.error("API Key Missing");
      return NextResponse.json({ error: "API Key missing" }, { status: 500 });
    }

    const client = new OpenAI({
      apiKey,
      baseURL,
    });

    const model = "gemini-3-pro-image-preview"; 

    console.log(`[Generate] Starting generation for ${product} with model ${model}`);

    // Enhanced System Instruction
    const systemInstruction = `
      You are an expert Product Designer for POD (Print on Demand) merchandise. 
      Your goal is to generate a HIGH-QUALITY, COMMERCIAL-GRADE product mockups.
      Rules:
      1. Focus on the product: ${product || "Merchandise"}. The product must be the ABSOLUTE MAIN SUBJECT.
      2. MINIMALIST COMPOSITION: Avoid clutter. The background and surrounding elements should be simple, clean, and not distracting.
      3. Reference Style: Mimic provided style if any.
      4. Subject Integration: Blend the subject seamlessly.
      5. Output: Clean, professional product shot.
      6. Aspect Ratio: 9:16 (Portrait).
      7. Resolution: 2K (High Definition).
      8. RETURN ONLY THE URL.
    `;

    // Merge system instruction into user message to avoid potential adapter issues with 'system' role
    let userPrompt = `
      ${systemInstruction}
      
      Design Task: ${fullPrompt}. Create a photorealistic ${product || "product"} design.
      
      IMPORTANT: The FIRST attached image is the SOURCE/PATTERN image. Use this image as the main subject or pattern source for the design.
      
      CRITICAL: Keep the scene CLEAN and UNCLUTTERED. The product should take up the majority of the frame and be clearly visible. Avoid excessive props or busy backgrounds.
    `;

    /*
    if (inspirationImage) {
        userPrompt += `\n\nIMPORTANT: The SECOND attached image is the PRODUCT/STYLE REFERENCE image. Strictly follow the product shape, angle, and composition shown in this reference image. Apply the pattern from the first image onto the product shown in the second image.`;
    }
    */

    const messages: any[] = [
      {
        role: "user",
        content: [
          { type: "text", text: userPrompt },
          {
            type: "image_url",
            image_url: {
              url: image, 
            },
          },
        ],
      },
    ];

    /*
    if (inspirationImage) {
       messages[0].content.push({
          type: "text", text: "Product/Style Reference Image:"
       });
       messages[0].content.push({
          type: "image_url",
          image_url: {
            url: inspirationImage,
          },
       });
    }
    */

    try {
      const response = await client.chat.completions.create({
        model: model,
        messages: messages,
      });

      const content = response.choices[0].message.content || "";
      console.log("[Generate] API Response Content:", content.substring(0, 100) + "..."); // Log first 100 chars

      // Extract image URL logic
      let imageUrl = null;
      
      // 1. Look for markdown image syntax: ![...](url) or just (url), supporting http and data:image
      const markdownMatch = content.match(/!\[.*?\]\((https?:\/\/.*?|data:image\/.*?)\)/);
      
      // 2. Look for any Base64 Data URI in the text
      const dataUriMatch = content.match(/(data:image\/[a-zA-Z]*;base64,[^\s)]+)/);

      // 3. Look for any http/https URL in the text
      const urlMatch = content.match(/(https?:\/\/[^\s)]+)/);

      if (markdownMatch) {
          imageUrl = markdownMatch[1];
      } else if (dataUriMatch) {
          imageUrl = dataUriMatch[1];
      } else if (urlMatch) {
          imageUrl = urlMatch[1];
      }
      
      // Cleanup
      if (imageUrl) {
          // Only trim trailing punctuation if it's NOT a data URI (Base64 often ends in '=')
          if (!imageUrl.startsWith('data:')) {
              imageUrl = imageUrl.replace(/[).,;]+$/, "").trim();
          }
      }
      
      console.log("[Generate] Extracted Image URL:", imageUrl ? (imageUrl.startsWith('data:') ? "Base64 Image (Length: " + imageUrl.length + ")" : imageUrl) : "null");

      if (!imageUrl) {
           console.error("[Generate] No URL found in content:", content);
           throw new Error(`No image URL found in model response. Content: ${content.substring(0, 200)}`);
      }

      return NextResponse.json({ result: imageUrl, full_content: content });

    } catch (apiError: any) {
      console.error("[Generate] API Call Failed:", apiError);
      // Check for specific OpenAI error structure
      if (apiError.response) {
        console.error("API Error Data:", apiError.response.data);
        console.error("API Error Status:", apiError.response.status);
      }
      throw apiError; // Re-throw to be caught by outer block
    }

  } catch (error: any) {
    console.error("[Generate] Unhandled Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate image" },
      { status: 500 }
    );
  }
}
