import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { prompt } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'your_gemini_api_key_here') {
      return NextResponse.json({ error: 'GEMINI_API_KEY is not configured on the server.' }, { status: 500 });
    }

    const sysInstruction = `You are an expert Engineering Graphics solving assistant. Read the user's prompt specifying a drafting problem and extract constraints. 
Also, provide an 8-stage step-by-step drafting solution (numbered from 1 to 8) that explains clearly how to physically draw the projection on paper. The 8 stages should correspond to:
1. Input Required (Summary of constraints)
2. Setup XY Plane
3. Stage 1: Top View Base (True shape and dimensions)
4. Stage 1: Front View Elevation (Projecting from base)
5. Stage 2: HP Inclination (Tilting elevation)
6. Stage 2: Top View Projection (Finding new plan)
7. Stage 3: VP Inclination (Twisting plan)
8. Stage 3: Final Front View (Elevating to get final result)

Ensure your explanation explicitly honors First Angle Projection standards: Top views (Plans) must remain appropriately below the XY reference line, while Front Views (Elevations) of solids resting on the HP sit precisely on the XY line.
Also, explicitly use standard drafting pencil terminology in your instruction steps:
- Use 'HB pencil' ONLY when talking about writing text, labels (like a', b'), and dimension numbers.
- Use 'H pencil' when talking about drawing both the visible solid boundaries and the dashed invisible edges.
- Use '2H pencil' when instructing to drop projecting lines (projectors), XY references, and dimensioning lines.

Output your response in this EXACT JSON format:
{
  "type": "Cylinder" | "Cone" | "Square Prism" | "Hexagonal Prism" | "Pentagonal Prism" | "Square Pyramid" | "Hexagonal Pyramid" | "Pentagonal Pyramid" | "Cube",
  "side": <number, base edge length radius. if diameter is given, halve it.>,
  "height": <number, axis length>,
  "theta": <number, inclination angle with HP or ground in degrees. Use 0 if not specified.>,
  "phi": <number, inclination angle with VP in degrees. Use 0 if not specified.>,
  "restFace": <boolean, true if resting on rectangular face, matching edge, or generator on HP>,
  "restCorner": <boolean, true if resting on corner, point on circumference, or apex>,
  "solutionSteps": [
    "<Step 1 description>",
    "<Step 2 description>",
    ... up to 8 steps
  ]
}
Only output the raw JSON, no markdown formatting.`;

    let data;
    let usedModel = "";
    const cascadeModels = [
      "gemini-2.0-flash",
      "gemini-1.5-flash",
      "gemini-1.5-pro",
      "gemini-2.5-flash"
    ];

    for (const model of cascadeModels) {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            systemInstruction: { role: "system", parts: [{ text: sysInstruction }] }
          })
        });
        
        data = await res.json();
        
        if (!data.error) {
            usedModel = model;
            console.log(`Successfully hit model: ${usedModel}`);
            break;
        }
        
        // If error is related to quota or not found, warn and shift to the next model in the architecture
        console.warn(`[${model}] rejected: ${data.error.message}`);
    }

    if (data.error) {
       console.error("All Models exhausted. Gemini API Error:", data.error);
       return NextResponse.json({ error: "All fallback models maxed out. " + data.error.message }, { status: 500 });
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
        return NextResponse.json({ error: "No text returned from Gemini." }, { status: 500 });
    }

    const jsonStr = text.replace(/\`\`\`json/gi, '').replace(/\`\`\`/g, '').trim();
    const extracted = JSON.parse(jsonStr);

    return NextResponse.json(extracted);
  } catch (error: any) {
    console.error('Error parsing prompt:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
