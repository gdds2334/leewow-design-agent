const fs = require('fs');
const OpenAI = require("openai");

const logFile = 'test-log.txt';
const log = (msg) => {
    console.log(msg);
    fs.appendFileSync(logFile, msg + '\n');
};

// Clear log
fs.writeFileSync(logFile, '');

log("Script started");

try {
    const apiKey = "sk-RrmUCHLK823BWXbK1bD6Bf19DaB34dCf9c0924E03f0392Ad";
    const baseURL = "https://api.laozhang.ai/v1";

    const client = new OpenAI({
      apiKey,
      baseURL,
    });

    log("Client created");

    async function testGenerate() {
      log("Testing gemini-3-pro-image-preview...");
      
      const prompt = "Design Task: A cool black hoodie with a neon cyber-cat. Create a photorealistic Black Hoodie design.";
      const image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

      try {
        const response = await client.chat.completions.create({
          model: "gemini-3-pro-image-preview",
          messages: [
            {
              role: "system",
              content: "Return ONLY the URL of the generated image."
            },
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

        log("Success!");
        log(JSON.stringify(response, null, 2));
      } catch (error) {
        log("Error caught:");
        if (error.response) {
            log("Status: " + error.status);
            log("Data: " + JSON.stringify(error.response.data, null, 2));
        } else {
            log(error.message);
        }
      }
    }

    testGenerate();
} catch (e) {
    log("Top level error: " + e.message);
}
