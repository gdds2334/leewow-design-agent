"use client";

import { useState, useRef, useEffect } from "react";
import { Upload, Image as ImageIcon, Loader2, X, Plus, Settings, Lightbulb, Download, ZoomIn, Package } from "lucide-react";
import clsx from "clsx";
import { motion, AnimatePresence } from "framer-motion";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import OpenAI from "openai";

// Initialize OpenAI Client (Frontend)
const getClient = () => {
  const apiKey = process.env.NEXT_PUBLIC_LAOZHANG_API_KEY;
  if (!apiKey) {
      throw new Error("API Key missing. Please set NEXT_PUBLIC_LAOZHANG_API_KEY in .env.local or Vercel Environment Variables.");
  }
  return new OpenAI({
    apiKey: apiKey,
    baseURL: "https://api.laozhang.ai/v1",
    dangerouslyAllowBrowser: true, // Allow running in browser
    timeout: 600000, // Set timeout to 10 minutes (600000 ms) to handle slow generations
  });
};

// --- API Functions (Moved to Frontend) ---

const analyzeImage = async (image: string, product: string, designTheme: string) => {
    const client = getClient();
    const targetProduct = product || "Merchandise";
    const baseStyle = "The design style should be fashionable, funny, or interesting.";
    const styleContext = designTheme 
        ? `The design theme MUST be strictly based on: "${designTheme}". ${baseStyle}`
        : baseStyle;

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

    const response = await client.chat.completions.create({
      model: "gemini-2.5-pro-thinking", 
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: image } },
          ],
        },
      ],
    });

    const content = response.choices[0].message.content || "";
    
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
    
    return JSON.parse(jsonString.trim());
};

const generateImage = async (image: string, product: string, pattern_desc: string, scene_desc: string) => {
    const client = getClient();
    const fullPrompt = `Design Pattern: ${pattern_desc}. High-end Scene Context: ${scene_desc}`;

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

    const userPrompt = `
      ${systemInstruction}
      
      Design Task: ${fullPrompt}. Create a photorealistic ${product || "product"} design.
      
      IMPORTANT: The FIRST attached image is the SOURCE/PATTERN image. Use this image as the main subject or pattern source for the design.
      
      CRITICAL: Keep the scene CLEAN and UNCLUTTERED. The product should take up the majority of the frame and be clearly visible. Avoid excessive props or busy backgrounds.
    `;

    const response = await client.chat.completions.create({
      model: "gemini-3-pro-image-preview",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: userPrompt },
            { type: "image_url", image_url: { url: image } },
          ],
        },
      ],
    });

    const content = response.choices[0].message.content || "";
    let imageUrl = null;
      
    const markdownMatch = content.match(/!\[.*?\]\((https?:\/\/.*?|data:image\/.*?)\)/);
    const dataUriMatch = content.match(/(data:image\/[a-zA-Z]*;base64,[^\s)]+)/);
    const urlMatch = content.match(/(https?:\/\/[^\s)]+)/);

    if (markdownMatch) imageUrl = markdownMatch[1];
    else if (dataUriMatch) imageUrl = dataUriMatch[1];
    else if (urlMatch) imageUrl = urlMatch[1];
    
    if (imageUrl && !imageUrl.startsWith('data:')) {
        imageUrl = imageUrl.replace(/[).,;]+$/, "").trim();
    }

    if (!imageUrl) throw new Error("No image URL found in response");

    return { result: imageUrl };
};

// Default products
const DEFAULT_PRODUCTS = [
  { id: "1", name: "Black Hoodie", /* inspirationImage: null */ },
  { id: "2", name: "Phone Case", /* inspirationImage: null */ },
  { id: "3", name: "Mug", /* inspirationImage: null */ },
  { id: "4", name: "Pillow", /* inspirationImage: null */ }
];

type ProductItem = {
  id: string;
  name: string;
  // inspirationImage: string | null;
};

type GenerationResult = {
  product: string;
  prompt: string;
  imageUrl?: string;
  loading: boolean;
  error?: string;
  statusText?: string; // Added statusText for individual countdowns
};

export default function Home() {
  const [image, setImage] = useState<string | null>(null);
  const [designTheme, setDesignTheme] = useState<string>(""); // New state for design theme
  // const [referenceImage, setReferenceImage] = useState<string | null>(null);
  // const [stylePrompt, setStylePrompt] = useState<string>("");
  const [products, setProducts] = useState<ProductItem[]>(DEFAULT_PRODUCTS);
  const [status, setStatus] = useState<"idle" | "analyzing" | "generating" | "done">("idle");
  const [progressMessage, setProgressMessage] = useState<string>("");
  const [progress, setProgress] = useState<number>(0);
  const [results, setResults] = useState<GenerationResult[]>([]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const refFileInputRef = useRef<HTMLInputElement>(null);
    // Handle ESC key to close modal
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setSelectedImage(null);
            }
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, []);

    const resizeImage = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const MAX_WIDTH = 800; // Reduced from 1024 to speed up upload/processing
          const scaleSize = MAX_WIDTH / img.width;
          canvas.width = MAX_WIDTH;
          canvas.height = img.height * scaleSize;
          const ctx = canvas.getContext("2d");
          ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.7)); // Compress to 70% quality
        };
      };
    });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const resized = await resizeImage(file);
      setImage(resized);
    }
  };

  /*
  const handleReferenceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const resized = await resizeImage(file);
      setReferenceImage(resized);
    }
  };
  */

  const addProduct = () => {
    if (products.length < 8) {
      setProducts([...products, { 
          id: Date.now().toString(), 
          name: "New Product", 
          // inspirationImage: null 
      }]);
    }
  };

  const updateProductName = (index: number, value: string) => {
    const newProducts = [...products];
    newProducts[index] = { ...newProducts[index], name: value };
    setProducts(newProducts);
  };

  /*
  const updateProductImage = async (index: number, file: File) => {
    const resized = await resizeImage(file);
    const newProducts = [...products];
    newProducts[index] = { ...newProducts[index], inspirationImage: resized };
    setProducts(newProducts);
  };

  const removeProductImage = (index: number) => {
    const newProducts = [...products];
    newProducts[index] = { ...newProducts[index], inspirationImage: null };
    setProducts(newProducts);
  };
  */

  const removeProduct = (index: number) => {
    if (products.length > 1) {
      setProducts(products.filter((_, i) => i !== index));
    }
  };

    const resultsRef = useRef<HTMLElement>(null);

    const handleGenerate = async () => {
        if (!image) return;

        // Scroll to results section
        setTimeout(() => {
            resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);

        setStatus("generating"); // Use generating directly as we do both now
    const estimatedAnalysisTime = 4; // Reduced estimate per product
    const estimatedGenTimePerImage = 15;
    setProgress(5);
    
    // Initialize results with waiting state
    const initialResults = products.map(p => ({
        product: p.name,
        prompt: "Waiting to start...",
        pattern_description: "",
        scene_description: "",
        loading: true,
        statusText: "Waiting..."
    }));
    setResults(initialResults);

    // Enhanced Parallel Generation
    try {
        const totalSteps = products.length * 2; // 2 steps per product (Analyze, Generate)
        let completedSteps = 0;

        const updateGlobalProgress = () => {
            completedSteps++;
            const percentage = Math.min(Math.floor((completedSteps / totalSteps) * 100), 99);
            setProgress(percentage);
        };

        // PARALLEL execution (Frontend direct call)
        await Promise.all(products.map(async (productConfig, idx) => {
            const productName = productConfig.name;

            // Update individual item state helper
            const updateItemState = (update: Partial<GenerationResult>) => {
                setResults(prev => {
                    const next = [...prev];
                    next[idx] = { ...next[idx], ...update };
                    return next;
                });
            };

            // 1. Analyze Phase
            let pattern_desc = "";
            let scene_desc = "";
            
            // Start local countdown for Analysis
            let analysisTime = 30;
            updateItemState({ loading: true, statusText: `Analyzing... (${analysisTime}s)` });
            const analysisTimer = setInterval(() => {
                analysisTime--;
                if (analysisTime > 0) {
                    updateItemState({ statusText: `Analyzing... (${analysisTime}s)` });
                } else {
                    updateItemState({ statusText: `Analyzing... (Processing)` });
                }
            }, 1000);

            try {
                // Call Frontend Function directly
                const data = await analyzeImage(image, productName, designTheme);
                
                clearInterval(analysisTimer); // Stop timer on response

                const design = data.design;
                
                if (design) {
                    pattern_desc = design.pattern_description;
                    scene_desc = design.scene_description;
                    updateItemState({ 
                        prompt: `Pattern: ${pattern_desc}\nScene: ${scene_desc}`,
                        pattern_description: pattern_desc,
                        scene_description: scene_desc
                    });
                }
            } catch (err: any) {
                clearInterval(analysisTimer);
                console.error(`Analysis error for ${productName}:`, err);
                updateItemState({ error: "Analysis Failed", loading: false, statusText: "Failed" });
                return; // Stop this product flow
            }
            
            updateGlobalProgress();

            // 2. Generate Phase
            // Start local countdown for Generation
            let genTime = 30;
            updateItemState({ loading: true, statusText: `Generating Image... (${genTime}s)` });
            const genTimer = setInterval(() => {
                genTime--;
                if (genTime > 0) {
                    updateItemState({ statusText: `Generating Image... (${genTime}s)` });
                } else {
                    updateItemState({ statusText: `Generating Image... (Processing)` });
                }
            }, 1000);

            try {
                // Call Frontend Function directly
                const genData = await generateImage(image, productName, pattern_desc, scene_desc);
                
                clearInterval(genTimer); // Stop timer
                
                updateItemState({
                    loading: false,
                    imageUrl: genData.result || null,
                    error: null,
                    statusText: "Done"
                });
            } catch (error: any) {
                clearInterval(genTimer);
                console.error(`Error generating for ${productName}:`, error);
                updateItemState({ loading: false, error: "Generation Failed", statusText: "Failed" });
            }

            updateGlobalProgress();
        }));

      setStatus("done");
      setProgressMessage("设计完成！");
      setProgress(100);

    } catch (error: any) {
      console.error(error);
      setStatus("idle");
      setProgressMessage("");
      setProgress(0);
      alert("An error occurred. Please try again.");
    }
  };

  const getFormattedName = (index: number) => {
      return (index + 2).toString().padStart(4, '0');
  };

  const handleDownload = async (url: string, filename: string) => {
      try {
          const link = document.createElement('a');
          link.href = url;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
      } catch (error) {
          console.error("Download failed", error);
          alert("下载失败，请重试");
      }
  };

  const handleDownloadAll = async () => {
      if (results.length === 0) return;
      
      const zip = new JSZip();
      const folder = zip.folder("leewow 视频物料");
      
      if (!folder) return;

      const validResults = results.filter(r => r.imageUrl);
      
      for (let i = 0; i < validResults.length; i++) {
          const result = validResults[i];
          if (result.imageUrl) {
              const filename = `${getFormattedName(i)}.jpg`;
              
              try {
                  let data: Blob | string = "";
                  let isBase64 = false;

                  if (result.imageUrl.startsWith("data:")) {
                      // Handle Base64
                      data = result.imageUrl.split(",")[1];
                      isBase64 = true;
                  } else {
                      // Handle URL
                      const response = await fetch(result.imageUrl);
                      data = await response.blob();
                      isBase64 = false;
                  }

                  if (isBase64) {
                       folder.file(filename, data, { base64: true });
                  } else {
                       folder.file(filename, data);
                  }

              } catch (err) {
                  console.error(`Failed to add ${filename} to zip`, err);
              }
          }
      }

      try {
          const content = await zip.generateAsync({ type: "blob" });
          saveAs(content, "leewow 视频物料.zip");
      } catch (err) {
          console.error("Failed to generate zip", err);
          alert("打包下载失败，请重试");
      }
  };

  return (
    <main className="min-h-screen bg-neutral-50 dark:bg-neutral-900 p-8 font-sans transition-colors duration-300">
      <div className="max-w-6xl mx-auto">
        <header className="mb-16 text-center relative">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-32 bg-purple-500/20 blur-3xl rounded-full -z-10"></div>
          <h1 className="text-5xl md:text-6xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-violet-600 to-indigo-600 mb-4 tracking-tight uppercase">
            Leewow's Design Agent
          </h1>
          {/* 
          <p className="text-xl md:text-2xl text-neutral-500 dark:text-neutral-400 font-light tracking-wide">
            Leewow
          </p>
          */}
        </header>

        {/* Upload Section */}
        <section className="mb-16">
          <div className="bg-white dark:bg-neutral-800 rounded-3xl shadow-2xl p-8 md:p-10 border border-neutral-100 dark:border-neutral-700 backdrop-blur-sm bg-opacity-80 dark:bg-opacity-80 transition-all hover:shadow-3xl duration-500">
            <div className="flex flex-col gap-10">
                <div className="flex flex-col lg:flex-row gap-10">
                    {/* Main Image Upload */}
                    <div 
                        onClick={() => fileInputRef.current?.click()}
                        className={clsx(
                            "w-full lg:w-5/12 h-80 md:h-96 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all duration-300 relative overflow-hidden group",
                            image ? "border-violet-500 bg-neutral-50 dark:bg-neutral-900" : "border-neutral-300 hover:border-violet-400 hover:bg-neutral-50 dark:border-neutral-600 dark:hover:bg-neutral-700/50"
                        )}
                    >
                        {image ? (
                            <img src={image} alt="Main Subject" className="w-full h-full object-contain p-4 group-hover:scale-105 transition-transform duration-500" />
                        ) : (
                            <div className="flex flex-col items-center gap-4 text-neutral-400 group-hover:text-violet-500 transition-colors">
                                <div className="p-4 rounded-full bg-neutral-100 dark:bg-neutral-700 group-hover:bg-violet-50 dark:group-hover:bg-violet-900/20 transition-colors">
                                    <Upload className="w-8 h-8" />
                                </div>
                                <p className="text-lg font-medium">上传主体图片 (人物/宠物)</p>
                                <p className="text-sm opacity-70">点击或拖拽文件至此</p>
                            </div>
                        )}
                        <input 
                            type="file" 
                            ref={fileInputRef} 
                            onChange={handleImageUpload} 
                            className="hidden" 
                            accept="image/*"
                        />
                    </div>

                    {/* Settings & Generate */}
                    <div className="flex-1 space-y-8">
                         {/* Style Reference Upload - COMMENTED OUT
                         <div>
                            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                                <ImageIcon className="w-5 h-5" /> 风格参考图 (可选)
                            </h3>
                            <div 
                                onClick={() => refFileInputRef.current?.click()}
                                className={clsx(
                                    "w-full h-32 border-2 border-dashed rounded-xl flex items-center justify-center cursor-pointer transition-colors relative overflow-hidden",
                                    referenceImage ? "border-purple-500" : "border-gray-300 hover:border-purple-400 dark:border-gray-600"
                                )}
                            >
                                {referenceImage ? (
                                    <img src={referenceImage} alt="Style Ref" className="w-full h-full object-cover" />
                                ) : (
                                    <div className="flex flex-col items-center">
                                        <Plus className="w-8 h-8 text-gray-400 mb-2" />
                                        <p className="text-xs text-gray-500">上传商品/风格参考图</p>
                                    </div>
                                )}
                                <input 
                                    type="file" 
                                    ref={refFileInputRef} 
                                    onChange={handleReferenceUpload} 
                                    className="hidden" 
                                    accept="image/*"
                                />
                            </div>
                        </div>
                        */}

                        {/* Style Text Input - COMMENTED OUT
                        <div>
                            <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                                <Lightbulb className="w-5 h-5" /> 风格/需求描述 (可选)
                            </h3>
                            <input
                                type="text"
                                value={stylePrompt}
                                onChange={(e) => setStylePrompt(e.target.value)}
                                placeholder="例如：赛博朋克风格、复古海报风、极简线条..."
                                className="w-full bg-gray-100 dark:bg-gray-700 rounded-xl px-4 py-3 outline-none border border-transparent focus:border-purple-500 transition-all"
                            />
                        </div>
                        */}

                        {/* Design Theme Input */}
                        <div className="bg-neutral-50 dark:bg-neutral-700/30 p-5 rounded-2xl border border-neutral-200 dark:border-neutral-600">
                            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2 text-neutral-700 dark:text-neutral-200">
                                <Lightbulb className="w-5 h-5 text-amber-500" /> 设计主题
                            </h3>
                            <input
                                type="text"
                                value={designTheme}
                                onChange={(e) => setDesignTheme(e.target.value)}
                                placeholder="例如：圣诞节、赛博朋克、中国风... (默认：时尚/有趣)"
                                className="w-full bg-white dark:bg-neutral-800 rounded-xl px-4 py-3.5 outline-none border border-neutral-200 dark:border-neutral-600 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all text-sm text-neutral-700 dark:text-neutral-200 placeholder-neutral-400"
                            />
                        </div>

                        {/* Target Products */}
                        <div>
                            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-neutral-700 dark:text-neutral-200">
                                <Settings className="w-5 h-5 text-violet-500" /> 目标商品配置
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {products.map((prod, idx) => (
                                    <div key={prod.id} className="bg-neutral-50 dark:bg-neutral-700/30 p-4 rounded-xl border border-neutral-200 dark:border-neutral-600 hover:border-violet-300 dark:hover:border-violet-500/50 transition-colors group relative">
                                        <div className="flex items-center gap-3">
                                            <span className="text-sm font-medium text-neutral-500 whitespace-nowrap">品名:</span>
                                            <input
                                                type="text"
                                                value={prod.name}
                                                onChange={(e) => updateProductName(idx, e.target.value)}
                                                className="bg-white dark:bg-neutral-800 rounded-lg px-3 py-2 text-sm border border-neutral-200 dark:border-neutral-600 focus:border-violet-500 outline-none w-full transition-all text-neutral-700 dark:text-neutral-200"
                                                placeholder="例如：手机壳"
                                            />
                                        </div>

                                        {/* Delete Product Button */}
                                        <button 
                                            onClick={() => removeProduct(idx)}
                                            className="absolute -right-2 -top-2 bg-red-500 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-all shadow-md hover:bg-red-600 scale-90 group-hover:scale-100"
                                            title="删除商品"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                ))}
                                
                                {/* Add Product Button */}
                                {products.length < 8 && (
                                    <button 
                                        onClick={addProduct}
                                        className="flex flex-col items-center justify-center p-4 rounded-xl border-2 border-dashed border-neutral-300 dark:border-neutral-600 hover:bg-violet-50 dark:hover:bg-violet-900/10 hover:border-violet-400 transition-all text-neutral-400 hover:text-violet-500 h-full min-h-[60px] gap-2"
                                    >
                                        <Plus className="w-5 h-5" />
                                        <span className="text-sm font-medium">添加商品</span>
                                    </button>
                                )}
                            </div>
                        </div>
                        
                        {/* Status Message & Progress */}
                         {status !== "idle" && status !== "done" && (
                            <div className="space-y-3">
                                <div className="flex justify-between text-sm font-medium text-neutral-600 dark:text-neutral-300">
                                    <span>Design Processing...</span>
                                    <span>{progress}%</span>
                                </div>
                                {/* Progress Bar */}
                                <div className="w-full bg-neutral-100 rounded-full h-3 dark:bg-neutral-700 overflow-hidden border border-neutral-200 dark:border-neutral-600">
                                    <div 
                                        className="bg-gradient-to-r from-violet-600 to-indigo-600 h-3 rounded-full transition-all duration-500 ease-out shadow-[0_0_10px_rgba(124,58,237,0.5)]" 
                                        style={{ width: `${progress}%` }}
                                    ></div>
                                </div>
                                <p className="text-xs text-neutral-400 text-center">{progressMessage}</p>
                            </div>
                        )}

                        <button
                            onClick={handleGenerate}
                            disabled={!image || status === "analyzing" || status === "generating"}
                            className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-bold py-4 rounded-xl shadow-lg shadow-violet-500/30 transform transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none flex items-center justify-center gap-3 text-lg"
                        >
                            {status === "analyzing" || status === "generating" ? (
                                 <>
                                    <Loader2 className="animate-spin w-6 h-6" />
                                    <span>Generating Designs...</span>
                                 </>
                            ) : (
                                 "Generate Designs"
                            )}
                        </button>
                    </div>
                </div>
            </div>
          </div>
        </section>

        {/* Image Modal */}
        <AnimatePresence>
            {selectedImage && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
                    onClick={() => setSelectedImage(null)}
                >
                    <motion.div
                        initial={{ scale: 0.9 }}
                        animate={{ scale: 1 }}
                        exit={{ scale: 0.9 }}
                        className="relative max-w-[95vw] max-h-[95vh] flex items-center justify-center"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <img src={selectedImage} alt="Zoomed" className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl bg-white" />
                        <button
                            onClick={() => setSelectedImage(null)}
                            className="absolute -top-4 -right-4 bg-white text-black rounded-full p-2 shadow-lg hover:bg-gray-100 transition-colors"
                        >
                            <X className="w-6 h-6" />
                        </button>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>

        {/* Results Grid */}
        <section ref={resultsRef} className="pb-24">
            {status === "done" && results.length > 0 && (
                <div className="flex flex-col sm:flex-row justify-between items-center mb-8 gap-6">
                     <h2 className="text-3xl font-bold text-neutral-800 dark:text-white flex items-center gap-3">
                        <span className="w-2 h-8 bg-violet-500 rounded-full"></span>
                        Generated Collection <span className="text-neutral-400 font-light">({results.length})</span>
                     </h2>
                    <button
                        onClick={handleDownloadAll}
                        className="bg-neutral-900 hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-200 text-white dark:text-neutral-900 font-bold py-3 px-8 rounded-full shadow-xl flex items-center gap-2 transition-all hover:-translate-y-1 active:translate-y-0"
                    >
                        <Package className="w-5 h-5" /> Download Package (ZIP)
                    </button>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-2 gap-8">
                <AnimatePresence>
                    {results.map((result, idx) => (
                        <motion.div
                            key={idx}
                            initial={{ opacity: 0, y: 30 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            transition={{ delay: idx * 0.1, type: "spring", stiffness: 100 }}
                            className="bg-white dark:bg-neutral-800 rounded-3xl overflow-hidden shadow-xl hover:shadow-2xl transition-all duration-500 group border border-neutral-100 dark:border-neutral-700"
                        >
                            <div className="h-[500px] bg-neutral-100 dark:bg-neutral-700/50 relative flex items-center justify-center overflow-hidden">
                                {result.loading ? (
                                    <div className="flex flex-col items-center gap-4 p-6 text-center">
                                        <div className="relative">
                                            <div className="w-16 h-16 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin"></div>
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <div className="w-2 h-2 bg-violet-600 rounded-full"></div>
                                            </div>
                                        </div>
                                        <span className="text-sm font-medium text-violet-600 dark:text-violet-400 animate-pulse tracking-wide">{result.statusText || "Processing..."}</span>
                                    </div>
                                ) : result.imageUrl ? (
                                    <>
                                        <img 
                                            src={result.imageUrl} 
                                            alt={result.product} 
                                            className="w-full h-full object-contain transition-transform duration-700 group-hover:scale-105 cursor-zoom-in p-2" 
                                            onClick={() => setSelectedImage(result.imageUrl || null)}
                                        />
                                        {/* Overlay Actions */}
                                        {/* Removed Zoom Button overlay, click image to zoom directly */}
                                        {/* 
                                        <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center gap-4 pointer-events-none group-hover:pointer-events-auto">
                                            <button 
                                                onClick={() => setSelectedImage(result.imageUrl || null)}
                                                className="bg-white text-neutral-900 p-4 rounded-full shadow-2xl hover:scale-110 transition-transform duration-300"
                                                title="Zoom In"
                                            >
                                                <ZoomIn className="w-6 h-6" />
                                            </button>
                                            <button 
                                                onClick={() => handleDownload(result.imageUrl!, `${getFormattedName(idx)}.jpg`)}
                                                className="bg-violet-600 text-white p-4 rounded-full shadow-2xl hover:scale-110 transition-transform duration-300"
                                                title="Download"
                                            >
                                                <Download className="w-6 h-6" />
                                            </button>
                                        </div>
                                        */}
                                        {/* Name Tag */}
                                        <div className="absolute top-6 left-6 bg-white/90 dark:bg-black/80 backdrop-blur-md text-neutral-900 dark:text-white px-4 py-1.5 rounded-full text-sm font-mono font-medium shadow-lg">
                                            {getFormattedName(idx)}
                                        </div>
                                    </>
                                ) : (
                                    <div className="text-red-500 flex flex-col items-center gap-2">
                                        <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-full">
                                            <X className="w-6 h-6" />
                                        </div>
                                        <span className="text-sm font-medium">Generation Failed</span>
                                    </div>
                                )}
                            </div>
                            <div className="p-6 bg-white dark:bg-neutral-800 relative z-10">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="font-bold text-xl text-neutral-800 dark:text-white group-hover:text-violet-600 transition-colors">{result.product}</h3>
                                    <div className="flex items-center gap-3">
                                        <span className="text-xs font-mono text-neutral-400 bg-neutral-100 dark:bg-neutral-700 px-2 py-1 rounded-md">{getFormattedName(idx)}</span>
                                        {result.imageUrl && (
                                            <button 
                                                onClick={() => handleDownload(result.imageUrl!, `${getFormattedName(idx)}.jpg`)}
                                                className="text-violet-600 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300 transition-colors p-1"
                                                title="Download Image"
                                            >
                                                <Download className="w-5 h-5" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <div className="text-sm text-neutral-600 dark:text-neutral-300 bg-neutral-50 dark:bg-neutral-700/30 p-4 rounded-xl border border-neutral-100 dark:border-neutral-700 max-h-32 overflow-y-auto custom-scrollbar">
                                    <span className="font-semibold text-xs text-violet-500 uppercase tracking-wider mb-2 block flex items-center gap-1">
                                        <Lightbulb className="w-3 h-3" /> AI Prompt:
                                    </span>
                                    <p className="leading-relaxed">{result.prompt}</p>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>
        </section>
      </div>
    </main>
  );
}
