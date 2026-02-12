
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require('fs');
const path = require('path');

// Read .env.local manually
const envPath = path.resolve(__dirname, '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const apiKeyMatch = envContent.match(/GOOGLE_API_KEY=(.*)/);
const apiKey = apiKeyMatch ? apiKeyMatch[1].trim() : null;

if (!apiKey) {
    console.error("Could not find GOOGLE_API_KEY in .env.local");
    process.exit(1);
}

console.log("Testing with API Key:", apiKey.substring(0, 10) + "...");

async function testModel(modelName) {
    console.log(`\nTesting model: ${modelName}...`);
    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent("Hello, are you working?");
        const response = await result.response;
        console.log(`✅ Success! Response: ${response.text()}`);
        return true;
    } catch (error) {
        console.error(`❌ Failed: ${error.message}`);
        return false;
    }
}

async function run() {
    const modelsToTest = [
        "gemini-flash-latest",
    ];

    console.log("Testing specific available models...");

    for (const model of modelsToTest) {
        const success = await testModel(model);
        if (success) {
            console.log(`\n🎉 FOUND WORKING MODEL: ${model}`);
            console.log("Please update your code to use this model.");
            break;
        }
    }
}

run();
