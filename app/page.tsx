"use client";

import { useState, useRef, useEffect } from "react";
import { Upload, Image as ImageIcon, Loader2, X, Plus, Settings, Lightbulb, Download, ZoomIn, Package, ToggleLeft, ToggleRight, RefreshCw, Edit3, FlaskConical, Sparkles } from "lucide-react";
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
      6. Aspect Ratio: 3:4 (Portrait).
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

const replaceImageSubject = async (originalImageUrl: string, newSubjectUrl: string, product: string, customPrompt?: string) => {
    const client = getClient();
    
    const systemInstruction = `
      你是一位专业的图像编辑专家。
      任务：将图1（商品图）中产品上的图案主体，替换为图2中的主体。
      
      规则：
      1. 基准图：图1是生成的商品图。你必须严格保持其构图、背景、光影和产品角度不变。
      2. 新主体：图2是新的主体（人物/宠物）。
      3. 操作：将图1中 ${product} 上的主要图形/图案主体，替换为图2中的主体。
      4. 风格：新主体必须采用与图1中图案完全相同的艺术风格。
      5. 输出：一张逼真的商品摄影图，除了图案主体改变外，其他与图1完全一致。
      6. 比例：3:4（竖版）。
      7. 分辨率：2K（高清）。
      8. 仅返回图片 URL。
    `;

    const userPrompt = customPrompt || `
      参考图1：当前商品图。
      参考图2：新主体。
      
      编辑图1：将 ${product} 上的图案主体替换为图2中的主体。
      保持背景场景和产品形态完全一致。
      匹配原图案的艺术风格。
    `;

    const response = await client.chat.completions.create({
      model: "gemini-3-pro-image-preview",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: systemInstruction },
            { type: "text", text: userPrompt },
            { type: "image_url", image_url: { url: originalImageUrl } }, // Image 1
            { type: "image_url", image_url: { url: newSubjectUrl } },    // Image 2
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

// Replace subject AND adapt scene to match new subject
const replaceImageSubjectWithScene = async (originalImageUrl: string, newSubjectUrl: string, product: string) => {
    const client = getClient();
    
    const systemInstruction = `
      你是一位专业的图像编辑专家。
      任务：将图1（商品图）中产品上的图案主体替换为图2中的主体，同时根据新主体调整商品的背景场景。
      
      规则：
      1. 基准图：图1是生成的商品图，参考其商品类型、构图和光影风格。
      2. 新主体：图2是新的主体（人物/宠物）。
      3. 主体操作：将图1中 ${product} 上的主要图形/图案主体，替换为图2中的主体。
      4. 场景操作：根据图2中主体的特点（如宠物品种、人物风格等），重新设计一个与该主体更契合的高端商品场景。
         - 例如：如果新主体是金毛犬，场景可以是温馨的客厅或户外草地；
         - 如果新主体是猫咪，场景可以是书房或窗台等；
         - 场景要能突出主体特点，营造情感共鸣。
      5. 风格：新主体必须采用与图1中图案相似的艺术风格（如卡通、写实等）。
      6. 输出：一张逼真的商品摄影图，商品 ${product} 为主体，场景与新主体特点契合。
      7. 比例：3:4（竖版）。
      8. 分辨率：2K（高清）。
      9. 仅返回图片 URL。
    `;

    const userPrompt = `
      参考图1：当前商品图（参考商品类型和图案风格）。
      参考图2：新主体。
      
      任务：
      1. 将 ${product} 上的图案主体替换为图2中的主体
      2. 根据图2中主体的特点，重新设计一个更契合的商品场景
      3. 保持商品类型和图案艺术风格不变
      4. 场景要高端、有氛围感，能与新主体产生情感共鸣
    `;

    const response = await client.chat.completions.create({
      model: "gemini-3-pro-image-preview",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: systemInstruction },
            { type: "text", text: userPrompt },
            { type: "image_url", image_url: { url: originalImageUrl } }, // Image 1
            { type: "image_url", image_url: { url: newSubjectUrl } },    // Image 2
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
  { id: "1", name: "Black Hoodie", enabled: true /* inspirationImage: null */ },
  { id: "2", name: "Phone Case", enabled: true /* inspirationImage: null */ },
  { id: "3", name: "Mug", enabled: true /* inspirationImage: null */ },
  { id: "4", name: "Pillow", enabled: true /* inspirationImage: null */ }
];

type ProductItem = {
  id: string;
  name: string;
  enabled: boolean;
  // inspirationImage: string | null;
};

type SubjectImage = {
  id: string;
  url: string;
  name: string;
};

type ImageVersion = {
  url: string;
  label: string;
  timestamp: number;
};

type PendingVersion = {
  id: string;
  label: string;
  loading: boolean;
  error?: string;
};

type GenerationResult = {
  subjectName: string;
  product: string;
  prompt: string;
  
  // Versioning
  versions: ImageVersion[];
  currentVersionIndex: number;
  pendingVersions: PendingVersion[]; // Loading placeholders for in-progress generations

  loading: boolean;
  replacementLoading?: boolean; // Loading state for replacement operation
  error?: string;
  statusText?: string;
  pattern_description?: string;
  scene_description?: string;
  fileIndex: number;

  // Local UI State for Replacement
  isReplacing?: boolean; 
  newSubjectImage?: string | null;
  replacePrompt?: string; // Custom prompt for replacement
  showPromptEditor?: boolean; // Toggle for prompt editor
};

export default function Home() {
  const [images, setImages] = useState<SubjectImage[]>([]);
  const [designTheme, setDesignTheme] = useState<string>(""); 
  const [products, setProducts] = useState<ProductItem[]>(DEFAULT_PRODUCTS);
  const [status, setStatus] = useState<"idle" | "analyzing" | "generating" | "done">("idle");
  const [progressMessage, setProgressMessage] = useState<string>("");
  const [progress, setProgress] = useState<number>(0);
  const [results, setResults] = useState<GenerationResult[]>([]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  
  const [isLoaded, setIsLoaded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [activeReplaceIndex, setActiveReplaceIndex] = useState<number | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Cleanup on unmount or refresh
  useEffect(() => {
    return () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
    };
  }, []);

  // Load products and design theme from localStorage on mount
  useEffect(() => {
      // Load products
      const savedProducts = localStorage.getItem("leewow_product_config");
      if (savedProducts) {
          try {
              const parsed = JSON.parse(savedProducts);
              // Ensure compatibility if structure changes (e.g. adding enabled field to old configs)
              const migrated = parsed.map((p: any) => ({
                  ...p,
                  enabled: p.enabled !== undefined ? p.enabled : true
              }));
              setProducts(migrated);
          } catch (e) {
              console.error("Failed to load products from localStorage", e);
          }
      }

      // Load design theme
      const savedTheme = localStorage.getItem("leewow_design_theme");
      if (savedTheme) {
          setDesignTheme(savedTheme);
      }

      setIsLoaded(true); // Mark initialization as complete
  }, []);

  // Save products to localStorage whenever they change
  useEffect(() => {
      if (isLoaded) {
          localStorage.setItem("leewow_product_config", JSON.stringify(products));
      }
  }, [products, isLoaded]);

  // Save design theme to localStorage whenever it changes
  useEffect(() => {
      if (isLoaded) {
          localStorage.setItem("leewow_design_theme", designTheme);
      }
  }, [designTheme, isLoaded]);

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

  const processFiles = async (files: File[]) => {
      if (files.length === 0) return;

      // Limit total images (existing + new) to 20? Or just process first 20 of this batch?
      // Requirement said "upload up to 20". Let's just process and let user manage.
      // Or slice to max 20 for safety.
      const filesToProcess = files.slice(0, 20);

      const newImages = await Promise.all(filesToProcess.map(async (file, idx) => {
          const resized = await resizeImage(file);
          return {
              id: Date.now() + Math.random().toString() + idx,
              url: resized,
              name: file.name.replace(/\.[^/.]+$/, "") || "pasted_image"
          };
      }));
      
      setImages(prev => [...prev, ...newImages]);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    await processFiles(files);
    // Reset input so same file can be selected again if needed
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
      const items = e.clipboardData.items;
      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
          if (items[i].type.indexOf("image") !== -1) {
              const file = items[i].getAsFile();
              if (file) files.push(file);
          }
      }
      if (files.length > 0) {
          e.preventDefault(); // Prevent default paste behavior
          await processFiles(files);
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
          enabled: true
          // inspirationImage: null 
      }]);
    }
  };

  const updateProductName = (index: number, value: string) => {
    const newProducts = [...products];
    newProducts[index] = { ...newProducts[index], name: value };
    setProducts(newProducts);
  };

  const toggleProduct = (index: number) => {
    const newProducts = [...products];
    newProducts[index] = { ...newProducts[index], enabled: !newProducts[index].enabled };
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
        if (images.length === 0) return;

        const enabledProducts = products.filter(p => p.enabled);
        if (enabledProducts.length === 0) {
            alert("请至少启用一个商品配置");
            return;
        }

        // Initialize AbortController
        abortControllerRef.current = new AbortController();
        const signal = abortControllerRef.current.signal;

        // Scroll to results section
        setTimeout(() => {
            resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);

        setStatus("generating");
        setProgress(0);
        
        // Create task list: (Image x Product)
        const tasks: { 
            taskId: string, 
            image: SubjectImage, 
            product: ProductItem,
            resultIndex: number 
        }[] = [];

        let resultIndex = 0;
        // Initialize results with waiting state
        const initialResults: GenerationResult[] = [];

        images.forEach(img => {
            let subjectFileIndex = 0; // Reset index for each subject
            enabledProducts.forEach(prod => {
                tasks.push({
                    taskId: `${img.id}-${prod.id}`,
                    image: img,
                    product: prod,
                    resultIndex: resultIndex
                });
                initialResults.push({
                    subjectName: img.name,
                    product: prod.name,
                    prompt: "Waiting to start...",
                    pattern_description: "",
                    scene_description: "",
                    loading: true,
                    statusText: "Waiting...",
                    fileIndex: subjectFileIndex, // Store 0-based index
                    versions: [],
                    currentVersionIndex: -1,
                    pendingVersions: []
                });
                resultIndex++;
                subjectFileIndex++;
            });
        });

        setResults(initialResults);

        try {
            const totalTasks = tasks.length;
            const totalSteps = totalTasks * 2; // Analyze + Generate
            let completedSteps = 0;

            const updateGlobalProgress = () => {
                completedSteps++;
                const percentage = Math.min(Math.floor((completedSteps / totalSteps) * 100), 99);
                setProgress(percentage);
            };

            const CONCURRENCY_LIMIT = 12;
            const activePromises: Promise<void>[] = [];
            let taskIndex = 0;

            const executeTask = async (task: typeof tasks[0]) => {
                if (signal.aborted) return;

                const { image: img, product: prod, resultIndex: idx } = task;
                const productName = prod.name;

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
                    if (signal.aborted) throw new Error("Aborted");
                    const data = await analyzeImage(img.url, productName, designTheme);
                    clearInterval(analysisTimer);

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
                    if (err.message !== "Aborted") {
                        console.error(`Analysis error for ${productName}:`, err);
                        updateItemState({ error: "Analysis Failed", loading: false, statusText: "Failed" });
                    }
                    return; 
                }
                
                updateGlobalProgress();

                // 2. Generate Phase
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
                    if (signal.aborted) throw new Error("Aborted");
                    const genData = await generateImage(img.url, productName, pattern_desc, scene_desc);
                    clearInterval(genTimer);
                    
                    updateItemState({
                        loading: false,
                        // imageUrl: genData.result || undefined, // Deprecated
                        versions: genData.result ? [{ url: genData.result, label: "Original", timestamp: Date.now() }] : [],
                        currentVersionIndex: genData.result ? 0 : -1,
                        error: undefined,
                        statusText: "Done"
                    });
                } catch (error: any) {
                    clearInterval(genTimer);
                    if (error.message !== "Aborted") {
                        console.error(`Error generating for ${productName}:`, error);
                        updateItemState({ loading: false, error: "Generation Failed", statusText: "Failed" });
                    }
                }

                updateGlobalProgress();
            };

            // Queue Processor
            while (taskIndex < tasks.length) {
                if (signal.aborted) break;

                // Fill up active promises to limit
                while (activePromises.length < CONCURRENCY_LIMIT && taskIndex < tasks.length) {
                    const task = tasks[taskIndex++];
                    const promise = executeTask(task).then(() => {
                        // Remove self from active promises
                        const idx = activePromises.indexOf(promise);
                        if (idx > -1) activePromises.splice(idx, 1);
                    });
                    activePromises.push(promise);
                }

                // Wait for at least one to finish before adding more
                if (activePromises.length >= CONCURRENCY_LIMIT) {
                    await Promise.race(activePromises);
                } else if (activePromises.length > 0) {
                    // If we have fewer than limit but no more tasks, wait for all
                    await Promise.all(activePromises);
                }
            }
            
            // Wait for remaining
            await Promise.all(activePromises);

            if (!signal.aborted) {
                setStatus("done");
                setProgressMessage("批量生成完成！");
                setProgress(100);
            }

        } catch (error: any) {
            if (error.message !== "Aborted") {
                console.error(error);
                setStatus("idle");
                setProgressMessage("");
                setProgress(0);
                alert("An error occurred. Please try again.");
            }
        } finally {
            abortControllerRef.current = null;
        }
    };

  const getFormattedName = (index: number) => {
      return (index + 2).toString().padStart(4, '0');
  };

  const handleDownloadAll = async () => {
      if (results.length === 0) return;
      
      const zip = new JSZip();
      const mainFolder = zip.folder("leewow 视频物料");
      
      if (!mainFolder) return;

      // Filter results that have at least one version with a URL
      const validResults = results.filter(r => r.versions && r.versions.length > 0 && r.versions[r.currentVersionIndex]?.url);
      
      for (let i = 0; i < validResults.length; i++) {
          const result = validResults[i];
          const currentVersion = result.versions[result.currentVersionIndex];
          if (currentVersion?.url) {
              // Structure: MainFolder / SubjectName / Product_Index.jpg
              // Sanitize folder names, allowing unicode characters but removing dangerous filesystem chars
              let safeSubjectName = result.subjectName.replace(/[\\/:*?"<>|]/g, '_').trim();
              if (!safeSubjectName || safeSubjectName === '.' || safeSubjectName === '..') {
                  safeSubjectName = `Subject_${i}`;
              }
              
              const subjectFolder = mainFolder.folder(safeSubjectName);
              
              if (subjectFolder) {
                  // Use result.fileIndex for naming
                  const filename = `${getFormattedName(result.fileIndex)}.jpg`; // Simplified name: just 0002.jpg
                  // If you want product name included: `${result.product}_${getFormattedName(result.fileIndex)}.jpg`
                  // But user request says: "corresponding 002 named images"
                  
                  try {
                      let data: Blob | string = "";
                      let isBase64 = false;

                      if (currentVersion.url.startsWith("data:")) {
                          data = currentVersion.url.split(",")[1];
                          isBase64 = true;
                      } else {
                          const response = await fetch(currentVersion.url);
                          data = await response.blob();
                          isBase64 = false;
                      }

                      if (isBase64) {
                           subjectFolder.file(filename, data, { base64: true });
                      } else {
                           subjectFolder.file(filename, data);
                      }

                  } catch (err) {
                      console.error(`Failed to add ${filename} to zip`, err);
                  }
              }
          }
      }

      try {
          const content = await zip.generateAsync({ type: "blob" });
          saveAs(content, "leewow_batch_results.zip");
      } catch (err) {
          console.error("Failed to generate zip", err);
          alert("打包下载失败，请重试");
      }
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

  const toggleReplaceUI = (index: number) => {
      setResults(prev => {
          const next = [...prev];
          const item = next[index];
          
          // Initialize default prompt if opening and not set
          let defaultPrompt = item.replacePrompt;
          if (!item.isReplacing && !defaultPrompt) {
              defaultPrompt = `参考图1：当前商品图。
参考图2：新主体。

任务：将图1商品（${item.product}）上的图案主体，替换为图2中的人物/宠物。
要求：
1. 保持背景场景、光影、构图完全不变。
2. 保持原图案的艺术风格。
3. 仅替换图案中的主体内容。`;
          }

          next[index] = { 
              ...item, 
              isReplacing: !item.isReplacing,
              newSubjectImage: null,
              replacePrompt: defaultPrompt
          };
          return next;
      });
  };

  const updateReplacePrompt = (index: number, prompt: string) => {
      setResults(prev => {
          const next = [...prev];
          next[index] = { ...next[index], replacePrompt: prompt };
          return next;
      });
  };

  const togglePromptEditor = (index: number) => {
      setResults(prev => {
          const next = [...prev];
          next[index] = { ...next[index], showPromptEditor: !next[index].showPromptEditor };
          return next;
      });
  };

  const triggerReplaceUpload = (index: number) => {
      setActiveReplaceIndex(index);
      // Small timeout to ensure state update before click (though ref doesn't depend on state)
      setTimeout(() => replaceInputRef.current?.click(), 0);
  };

  const handleReplaceFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const idx = activeReplaceIndex;
      if (idx === null) return;
      
      const file = e.target.files?.[0];
      if (file) {
          const resized = await resizeImage(file);
          setResults(prev => {
              const next = [...prev];
              next[idx] = { ...next[idx], newSubjectImage: resized };
              return next;
          });
      }
      // Reset input
      if (replaceInputRef.current) replaceInputRef.current.value = '';
  };

  const executeCardReplace = async (index: number) => {
      const item = results[index];
      if (!item || !item.newSubjectImage) return;

      const currentVer = item.versions[item.currentVersionIndex];
      if (!currentVer) {
          alert("没有基准图片");
          return;
      }

      // Create pending version for loading thumbnail
      const pendingId = `replace-${Date.now()}`;
      const pendingVersion: PendingVersion = {
          id: pendingId,
          label: `Replaced ${item.versions.length}`,
          loading: true
      };

      // Close replace UI, add pending version, keep original visible
      setResults(prev => {
          const next = [...prev];
          next[index] = { 
              ...next[index], 
              isReplacing: false,
              newSubjectImage: null,
              pendingVersions: [...(next[index].pendingVersions || []), pendingVersion],
              statusText: "替换中..."
          };
          return next;
      });

      try {
          const genData = await replaceImageSubject(
              currentVer.url, 
              item.newSubjectImage, 
              item.product,
              item.replacePrompt
          );

          if (!genData.result) throw new Error("No result from API");

          // Success: Remove pending, add real version, switch to it
          setResults(prev => {
              const next = [...prev];
              const updatedItem = next[index];
              
              const newVersion = { 
                  url: genData.result!, 
                  label: `Replaced ${updatedItem.versions.length}`, 
                  timestamp: Date.now() 
              };

              next[index] = {
                  ...updatedItem,
                  pendingVersions: updatedItem.pendingVersions.filter(p => p.id !== pendingId),
                  versions: [...updatedItem.versions, newVersion],
                  currentVersionIndex: updatedItem.versions.length, // Switch to new
                  statusText: "替换完成"
              };
              
              console.log("Updated Item:", next[index]);
              return next;
          });

      } catch (error: any) {
          console.error("Replace failed", error);
          // Mark pending as error
          setResults(prev => {
              const next = [...prev];
              const updatedItem = next[index];
              next[index] = { 
                  ...updatedItem, 
                  pendingVersions: updatedItem.pendingVersions.map(p => 
                      p.id === pendingId ? { ...p, loading: false, error: "Failed" } : p
                  ),
                  statusText: "替换失败"
              };
              return next;
          });
          alert("替换主体失败: " + (error.message || "Unknown error"));
      }
  };

  const toggleVersion = (resultIndex: number, versionIndex: number) => {
      setResults(prev => {
          const next = [...prev];
          next[resultIndex] = { ...next[resultIndex], currentVersionIndex: versionIndex };
          return next;
      });
  };

  // Test images paths (put your test images in public/test-images/)
  const TEST_IMAGES = [
      "/test-images/test1.jpg",
      "/test-images/test2.jpg",
      "/test-images/test3.jpg",
      "/test-images/test4.jpg",
  ];

  // Batch test: use all test images to replace subject on a single result card (PARALLEL)
  const runBatchTest = async (index: number) => {
      const item = results[index];
      if (!item) return;

      const currentVer = item.versions[item.currentVersionIndex];
      if (!currentVer) {
          alert("没有基准图片可供测试");
          return;
      }

      // Confirm
      if (!confirm(`将使用 ${TEST_IMAGES.length} 张测试图片对该商品进行批量替换测试，是否继续？`)) {
          return;
      }

      // Create pending versions for loading thumbnails
      const pendingIds = TEST_IMAGES.map((_, i) => `test-${Date.now()}-${i}`);
      const initialPendingVersions: PendingVersion[] = TEST_IMAGES.map((_, i) => ({
          id: pendingIds[i],
          label: `Test ${i + 1}`,
          loading: true
      }));

      // Add pending versions to show loading thumbnails
      setResults(prev => {
          const next = [...prev];
          next[index] = { 
              ...next[index], 
              pendingVersions: initialPendingVersions,
              statusText: `批量测试中... (0/${TEST_IMAGES.length})`
          };
          return next;
      });

      let successCount = 0;

      // Process all test images in PARALLEL
      const promises = TEST_IMAGES.map(async (testImagePath, i) => {
          const pendingId = pendingIds[i];
          
          try {
              // Fetch test image and convert to base64
              const response = await fetch(testImagePath);
              if (!response.ok) {
                  throw new Error(`Test image not found: ${testImagePath}`);
              }
              const blob = await response.blob();
              const testImageBase64 = await new Promise<string>((resolve) => {
                  const reader = new FileReader();
                  reader.onloadend = () => resolve(reader.result as string);
                  reader.readAsDataURL(blob);
              });

              // Call replace API
              const genData = await replaceImageSubject(
                  currentVer.url,
                  testImageBase64,
                  item.product,
                  item.replacePrompt
              );

              if (genData.result) {
                  // Success: Remove pending, add real version
                  setResults(prev => {
                      const next = [...prev];
                      const updatedItem = next[index];
                      const newVersion = {
                          url: genData.result!,
                          label: `Test ${i + 1}`,
                          timestamp: Date.now()
                      };
                      
                      next[index] = {
                          ...updatedItem,
                          pendingVersions: updatedItem.pendingVersions.filter(p => p.id !== pendingId),
                          versions: [...updatedItem.versions, newVersion],
                          currentVersionIndex: updatedItem.versions.length, // Switch to new
                          statusText: `测试中...`
                      };
                      return next;
                  });
                  successCount++;
                  return true;
              }
              throw new Error("No result");
          } catch (error) {
              console.error(`Test image ${i + 1} failed:`, error);
              // Mark pending as error
              setResults(prev => {
                  const next = [...prev];
                  const updatedItem = next[index];
                  next[index] = {
                      ...updatedItem,
                      pendingVersions: updatedItem.pendingVersions.map(p => 
                          p.id === pendingId ? { ...p, loading: false, error: "Failed" } : p
                      )
                  };
                  return next;
              });
              return false;
          }
      });

      // Wait for all to complete
      await Promise.all(promises);

      // Final cleanup: remove any remaining pending versions and update status
      setResults(prev => {
          const next = [...prev];
          const updatedItem = next[index];
          
          next[index] = {
              ...updatedItem,
              pendingVersions: [], // Clear all pending
              statusText: `测试完成 (${successCount}/${TEST_IMAGES.length})`
          };
          
          return next;
      });

      if (successCount === 0) {
          alert("批量测试失败，请确保 public/test-images/ 文件夹下有 test1.jpg ~ test4.jpg");
      } else {
          alert(`批量测试完成！成功生成 ${successCount} 张图片`);
      }
  };

  // Batch test WITH SCENE ADAPTATION: replace subject AND adjust scene to match new subject
  const runBatchTestWithScene = async (index: number) => {
      const item = results[index];
      if (!item) return;

      const currentVer = item.versions[item.currentVersionIndex];
      if (!currentVer) {
          alert("没有基准图片可供测试");
          return;
      }

      // Confirm
      if (!confirm(`将使用 ${TEST_IMAGES.length} 张测试图片进行「场景测试」：替换主体的同时，根据新主体调整场景。是否继续？`)) {
          return;
      }

      // Create pending versions for loading thumbnails
      const pendingIds = TEST_IMAGES.map((_, i) => `scene-test-${Date.now()}-${i}`);
      const initialPendingVersions: PendingVersion[] = TEST_IMAGES.map((_, i) => ({
          id: pendingIds[i],
          label: `Scene ${i + 1}`,
          loading: true
      }));

      // Add pending versions to show loading thumbnails
      setResults(prev => {
          const next = [...prev];
          next[index] = { 
              ...next[index], 
              pendingVersions: [...(next[index].pendingVersions || []), ...initialPendingVersions],
              statusText: `场景测试中... (0/${TEST_IMAGES.length})`
          };
          return next;
      });

      let successCount = 0;

      // Process all test images in PARALLEL
      const promises = TEST_IMAGES.map(async (testImagePath, i) => {
          const pendingId = pendingIds[i];
          
          try {
              // Fetch test image and convert to base64
              const response = await fetch(testImagePath);
              if (!response.ok) {
                  throw new Error(`Test image not found: ${testImagePath}`);
              }
              const blob = await response.blob();
              const testImageBase64 = await new Promise<string>((resolve) => {
                  const reader = new FileReader();
                  reader.onloadend = () => resolve(reader.result as string);
                  reader.readAsDataURL(blob);
              });

              // Call replace WITH SCENE API
              const genData = await replaceImageSubjectWithScene(
                  currentVer.url,
                  testImageBase64,
                  item.product
              );

              if (genData.result) {
                  // Success: Remove pending, add real version
                  setResults(prev => {
                      const next = [...prev];
                      const updatedItem = next[index];
                      const newVersion = {
                          url: genData.result!,
                          label: `Scene ${i + 1}`,
                          timestamp: Date.now()
                      };
                      
                      next[index] = {
                          ...updatedItem,
                          pendingVersions: updatedItem.pendingVersions.filter(p => p.id !== pendingId),
                          versions: [...updatedItem.versions, newVersion],
                          currentVersionIndex: updatedItem.versions.length, // Switch to new
                          statusText: `场景测试中...`
                      };
                      return next;
                  });
                  successCount++;
                  return true;
              }
              throw new Error("No result");
          } catch (error) {
              console.error(`Scene test image ${i + 1} failed:`, error);
              // Mark pending as error
              setResults(prev => {
                  const next = [...prev];
                  const updatedItem = next[index];
                  next[index] = {
                      ...updatedItem,
                      pendingVersions: updatedItem.pendingVersions.map(p => 
                          p.id === pendingId ? { ...p, loading: false, error: "Failed" } : p
                      )
                  };
                  return next;
              });
              return false;
          }
      });

      // Wait for all to complete
      await Promise.all(promises);

      // Final cleanup: remove any remaining pending versions and update status
      setResults(prev => {
          const next = [...prev];
          const updatedItem = next[index];
          
          next[index] = {
              ...updatedItem,
              pendingVersions: [], // Clear all pending
              statusText: `场景测试完成 (${successCount}/${TEST_IMAGES.length})`
          };
          
          return next;
      });

      if (successCount === 0) {
          alert("场景测试失败，请确保 public/test-images/ 文件夹下有 test1.jpg ~ test4.jpg");
      } else {
          alert(`场景测试完成！成功生成 ${successCount} 张图片`);
      }
  };

  if (!isLoaded) {
      return (
          <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 flex items-center justify-center">
              <Loader2 className="w-10 h-10 text-violet-500 animate-spin" />
          </div>
      );
  }

  return (
    <main className="min-h-screen bg-neutral-50 dark:bg-neutral-900 p-8 font-sans transition-colors duration-300">
      <div className="max-w-6xl mx-auto">
        <header className="mb-16 text-center relative">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-32 bg-purple-500/20 blur-3xl rounded-full -z-10"></div>
          <h1 className="text-5xl md:text-6xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-violet-600 to-indigo-600 mb-4 tracking-tight uppercase">
            Leewow's Design Agent
          </h1>
        </header>

        {/* Upload Section */}
        <section className="mb-16">
          <div className="bg-white dark:bg-neutral-800 rounded-3xl shadow-2xl p-8 md:p-10 border border-neutral-100 dark:border-neutral-700 backdrop-blur-sm bg-opacity-80 dark:bg-opacity-80 transition-all hover:shadow-3xl duration-500">
            <div className="flex flex-col gap-10">
                <div className="flex flex-col lg:flex-row gap-10">
                    {/* Main Image Upload (Multiple) */}
                    <div 
                        onClick={() => fileInputRef.current?.click()}
                        onPaste={handlePaste}
                        tabIndex={0}
                        className={clsx(
                            "w-full lg:w-5/12 h-80 md:h-96 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all duration-300 relative overflow-hidden group outline-none focus:ring-2 focus:ring-violet-500/50",
                            images.length > 0 ? "border-violet-500 bg-neutral-50 dark:bg-neutral-900" : "border-neutral-300 hover:border-violet-400 hover:bg-neutral-50 dark:border-neutral-600 dark:hover:bg-neutral-700/50"
                        )}
                    >
                        {images.length > 0 ? (
                             <div className="w-full h-full p-4 flex flex-col items-center justify-center gap-4">
                                <div className="grid grid-cols-3 gap-2 w-full max-h-60 overflow-y-auto p-2">
                                    {images.map((img, i) => (
                                        <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-neutral-200 group/item">
                                            <img src={img.url} alt={img.name} className="w-full h-full object-cover" />
                                            <button 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setImages(images.filter((_, idx) => idx !== i));
                                                }}
                                                className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover/item:opacity-100 transition-opacity"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                                <p className="text-sm font-medium text-violet-600">{images.length} 张图片已上传</p>
                                <p className="text-xs text-neutral-400">点击继续上传 或 Ctrl+V 粘贴</p>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center gap-4 text-neutral-400 group-hover:text-violet-500 transition-colors">
                                <div className="p-4 rounded-full bg-neutral-100 dark:bg-neutral-700 group-hover:bg-violet-50 dark:group-hover:bg-violet-900/20 transition-colors">
                                    <Upload className="w-8 h-8" />
                                </div>
                                <p className="text-lg font-medium">上传主体图片</p>
                                <p className="text-sm opacity-70">点击选择、拖拽 或 Ctrl+V 粘贴</p>
                            </div>
                        )}
                        <input 
                            type="file" 
                            ref={fileInputRef} 
                            onChange={handleImageUpload} 
                            className="hidden" 
                            accept="image/*"
                            multiple // Enable multiple selection
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
                                    <div key={prod.id} className={clsx(
                                        "bg-neutral-50 dark:bg-neutral-700/30 p-4 rounded-xl border border-neutral-200 dark:border-neutral-600 transition-all group relative",
                                        prod.enabled ? "hover:border-violet-300 dark:hover:border-violet-500/50" : "opacity-60"
                                    )}>
                                        <div className="flex items-center gap-3">
                                            <button
                                                onClick={() => toggleProduct(idx)}
                                                className={clsx(
                                                    "transition-colors focus:outline-none",
                                                    prod.enabled ? "text-violet-500 hover:text-violet-600" : "text-neutral-400 hover:text-neutral-500"
                                                )}
                                                title={prod.enabled ? "禁用商品" : "启用商品"}
                                            >
                                                {prod.enabled ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
                                            </button>
                                            <span className="text-sm font-medium text-neutral-500 whitespace-nowrap">品名:</span>
                                            <input
                                                type="text"
                                                value={prod.name}
                                                onChange={(e) => updateProductName(idx, e.target.value)}
                                                disabled={!prod.enabled}
                                                className={clsx(
                                                    "bg-white dark:bg-neutral-800 rounded-lg px-3 py-2 text-sm border border-neutral-200 dark:border-neutral-600 focus:border-violet-500 outline-none w-full transition-all text-neutral-700 dark:text-neutral-200",
                                                    !prod.enabled && "bg-neutral-100 dark:bg-neutral-900 text-neutral-400"
                                                )}
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
                            disabled={images.length === 0 || status === "analyzing" || status === "generating"}
                            className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-bold py-4 rounded-xl shadow-lg shadow-violet-500/30 transform transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none flex items-center justify-center gap-3 text-lg"
                        >
                            {status === "analyzing" || status === "generating" ? (
                                 <>
                                    <Loader2 className="animate-spin w-6 h-6" />
                                    <span>Generating Designs ({progress}%)...</span>
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

        {/* Hidden Input for Replace Subject */}
        <input 
            type="file" 
            ref={replaceInputRef} 
            onChange={handleReplaceFileChange} 
            className="hidden" 
            accept="image/*"
        />

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

        {/* Replace Subject Modal - REMOVED */}

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
                    {results.map((result, idx) => {
                        const hasVersions = result.versions && result.versions.length > 0;
                        const currentVersion = hasVersions 
                            ? (result.versions[result.currentVersionIndex] || result.versions[result.versions.length - 1])
                            : null;
                        
                        return (
                        <motion.div
                            key={idx}
                            initial={{ opacity: 0, y: 30 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            transition={{ delay: idx * 0.05, type: "spring", stiffness: 100 }}
                            className="bg-white dark:bg-neutral-800 rounded-3xl overflow-hidden shadow-xl hover:shadow-2xl transition-all duration-500 group border border-neutral-100 dark:border-neutral-700 flex flex-col"
                        >
                            {/* Image Area - 3:4 aspect ratio */}
                            <div className="aspect-[3/4] bg-neutral-100 dark:bg-neutral-700/50 relative flex items-center justify-center overflow-hidden">
                                {result.loading ? (
                                    <div className="flex flex-col items-center gap-4 p-6 text-center">
                                        <div className="relative">
                                            <div className="w-16 h-16 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin"></div>
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <div className="w-2 h-2 bg-violet-600 rounded-full"></div>
                                            </div>
                                        </div>
                                        <span className="text-sm font-medium text-violet-600 dark:text-violet-400 animate-pulse tracking-wide">
                                            {result.statusText || "Processing..."}
                                        </span>
                                        <p className="text-xs text-neutral-400 mt-1">{result.subjectName}</p>
                                    </div>
                                ) : result.isReplacing ? (
                                    // In-Card Replacement UI
                                    <div className="w-full h-full flex flex-col items-center justify-center p-8 bg-neutral-50 dark:bg-neutral-800/50 backdrop-blur-sm z-20">
                                        <div 
                                            onClick={() => triggerReplaceUpload(idx)}
                                            className={clsx(
                                                "w-full h-64 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all duration-300 relative overflow-hidden group/upload",
                                                result.newSubjectImage ? "border-violet-500 bg-white dark:bg-neutral-900" : "border-neutral-300 hover:border-violet-400 hover:bg-white dark:border-neutral-600 dark:hover:bg-neutral-700/50"
                                            )}
                                        >
                                            {result.newSubjectImage ? (
                                                <img src={result.newSubjectImage} alt="New Subject" className="w-full h-full object-contain p-4" />
                                            ) : (
                                                <div className="flex flex-col items-center gap-3 text-neutral-400 group-hover/upload:text-violet-500 transition-colors">
                                                    <Upload className="w-10 h-10" />
                                                    <span className="text-sm font-medium">点击上传新主体</span>
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex gap-3 w-full mt-6">
                                            <button
                                                onClick={() => toggleReplaceUI(idx)}
                                                className="flex-1 py-3 rounded-xl border border-neutral-300 dark:border-neutral-600 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
                                            >
                                                取消
                                            </button>
                                            <button
                                                onClick={() => executeCardReplace(idx)}
                                                disabled={!result.newSubjectImage}
                                                className="flex-1 py-3 rounded-xl bg-violet-600 text-white font-bold hover:bg-violet-700 shadow-lg shadow-violet-500/20 disabled:opacity-50 disabled:shadow-none transition-all"
                                            >
                                                确认替换
                                            </button>
                                        </div>
                                    </div>
                                ) : currentVersion ? (
                                    // Image Display
                                    <>
                                        <img 
                                            src={currentVersion.url} 
                                            alt={result.product} 
                                            className="w-full h-full object-contain transition-transform duration-700 group-hover:scale-105 cursor-zoom-in p-2" 
                                            onClick={() => setSelectedImage(currentVersion.url || null)}
                                        />
                                        {/* Version Badge */}
                                        {hasVersions && (
                                            <div className="absolute top-6 left-6 bg-black/60 backdrop-blur-md text-white px-3 py-1 rounded-full text-xs font-medium shadow-lg border border-white/10">
                                                {currentVersion.label}
                                            </div>
                                        )}
                                        {/* Subject Name Badge */}
                                        <div className="absolute top-6 right-6 bg-violet-500/90 backdrop-blur-md text-white px-3 py-1 rounded-full text-xs font-medium shadow-lg">
                                            {result.subjectName}
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

                            {/* Content Area */}
                            <div className="p-6 bg-white dark:bg-neutral-800 relative z-10 flex-1 flex flex-col">
                                <div className="flex justify-between items-start mb-4">
                                    <div>
                                        <h3 className="font-bold text-xl text-neutral-800 dark:text-white group-hover:text-violet-600 transition-colors">{result.product}</h3>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="text-xs font-mono text-neutral-400 bg-neutral-100 dark:bg-neutral-700 px-2 py-0.5 rounded-md">{getFormattedName(result.fileIndex)}</span>
                                        </div>
                                    </div>
                                    
                                    {/* Actions */}
                                    {currentVersion && (
                                        <div className="flex items-center gap-2">
                                            <button 
                                                onClick={() => togglePromptEditor(idx)}
                                                className={clsx(
                                                    "p-2 rounded-full transition-all",
                                                    result.showPromptEditor 
                                                        ? "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400" 
                                                        : "text-neutral-400 hover:text-amber-600 hover:bg-neutral-100 dark:hover:bg-neutral-700"
                                                )}
                                                title="编辑替换 Prompt"
                                            >
                                                <Edit3 className="w-5 h-5" />
                                            </button>
                                            <button 
                                                onClick={() => runBatchTest(idx)}
                                                disabled={result.pendingVersions && result.pendingVersions.length > 0}
                                                className="p-2 rounded-full text-neutral-400 hover:text-green-600 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-all disabled:opacity-50"
                                                title="批量测试 (只换主体)"
                                            >
                                                <FlaskConical className="w-5 h-5" />
                                            </button>
                                            <button 
                                                onClick={() => runBatchTestWithScene(idx)}
                                                disabled={result.pendingVersions && result.pendingVersions.length > 0}
                                                className="p-2 rounded-full text-neutral-400 hover:text-cyan-600 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-all disabled:opacity-50"
                                                title="场景测试 (换主体+换场景)"
                                            >
                                                <Sparkles className="w-5 h-5" />
                                            </button>
                                            <button 
                                                onClick={() => toggleReplaceUI(idx)}
                                                className={clsx(
                                                    "p-2 rounded-full transition-all",
                                                    result.isReplacing 
                                                        ? "bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400" 
                                                        : "text-neutral-400 hover:text-violet-600 hover:bg-neutral-100 dark:hover:bg-neutral-700"
                                                )}
                                                title="替换主体"
                                            >
                                                <RefreshCw className="w-5 h-5" />
                                            </button>
                                            <button 
                                                onClick={() => handleDownload(currentVersion.url, `${result.subjectName}_${result.product}_${currentVersion.label}.jpg`)}
                                                className="p-2 rounded-full text-neutral-400 hover:text-violet-600 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-all"
                                                title="下载图片"
                                            >
                                                <Download className="w-5 h-5" />
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {/* Version Switcher (Thumbnails) - Show when multiple versions OR pending versions exist */}
                                {(hasVersions && (result.versions.length > 1 || (result.pendingVersions && result.pendingVersions.length > 0))) && (
                                    <div className="flex gap-2 mb-4 overflow-x-auto py-2 scrollbar-none">
                                        {/* Existing versions */}
                                        {result.versions.map((ver, vIdx) => (
                                            <div 
                                                key={`ver-${vIdx}`}
                                                onClick={() => toggleVersion(idx, vIdx)}
                                                className={clsx(
                                                    "w-12 h-16 rounded-lg border-2 overflow-hidden cursor-pointer flex-shrink-0 transition-all",
                                                    result.currentVersionIndex === vIdx 
                                                        ? "border-violet-500 shadow-md scale-105" 
                                                        : "border-transparent opacity-60 hover:opacity-100 hover:border-neutral-300"
                                                )}
                                                title={ver.label}
                                            >
                                                <img src={ver.url} className="w-full h-full object-cover" alt={ver.label} />
                                            </div>
                                        ))}
                                        {/* Pending versions (loading thumbnails) */}
                                        {result.pendingVersions && result.pendingVersions.map((pending) => (
                                            <div 
                                                key={pending.id}
                                                className={clsx(
                                                    "w-12 h-16 rounded-lg border-2 overflow-hidden flex-shrink-0 flex items-center justify-center",
                                                    pending.error 
                                                        ? "border-red-300 bg-red-50 dark:bg-red-900/20" 
                                                        : "border-violet-300 bg-violet-50 dark:bg-violet-900/20 animate-pulse"
                                                )}
                                                title={pending.error || pending.label}
                                            >
                                                {pending.loading ? (
                                                    <Loader2 className="w-4 h-4 text-violet-500 animate-spin" />
                                                ) : pending.error ? (
                                                    <X className="w-4 h-4 text-red-500" />
                                                ) : null}
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <div className="text-sm text-neutral-600 dark:text-neutral-300 bg-neutral-50 dark:bg-neutral-700/30 p-4 rounded-xl border border-neutral-100 dark:border-neutral-700 max-h-32 overflow-y-auto custom-scrollbar mt-auto">
                                    <span className="font-semibold text-xs text-violet-500 uppercase tracking-wider mb-2 block flex items-center gap-1">
                                        <Lightbulb className="w-3 h-3" /> AI Prompt:
                                    </span>
                                    <p className="leading-relaxed">{result.prompt}</p>
                                </div>

                                {/* Independent Prompt Editor */}
                                {result.showPromptEditor && (
                                    <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800">
                                        <div className="flex items-center justify-between mb-3">
                                            <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider flex items-center gap-1">
                                                <Edit3 className="w-3 h-3" /> 自定义替换指令
                                            </span>
                                            <button
                                                onClick={() => togglePromptEditor(idx)}
                                                className="text-neutral-400 hover:text-neutral-600 transition-colors"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                        <textarea
                                            value={result.replacePrompt || `参考图1：当前商品图。
参考图2：新主体。

任务：将图1商品（${result.product}）上的图案主体，替换为图2中的人物/宠物。
要求：
1. 保持背景场景、光影、构图完全不变。
2. 保持原图案的艺术风格。
3. 仅替换图案中的主体内容。`}
                                            onChange={(e) => updateReplacePrompt(idx, e.target.value)}
                                            className="w-full bg-white dark:bg-neutral-900 rounded-lg p-3 text-sm border border-amber-200 dark:border-amber-700 focus:border-amber-500 outline-none transition-all min-h-[120px] resize-y"
                                            placeholder="输入自定义替换 Prompt..."
                                        />
                                        <p className="text-xs text-amber-600 dark:text-amber-500 mt-2">
                                            💡 此 Prompt 将用于"替换主体"和"批量测试"操作
                                        </p>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    );
                    })}
                </AnimatePresence>
            </div>
        </section>
      </div>
    </main>
  );
}
