const generateResponse = (problem, type, confidence, severity, analysisArr, solArr, estimate, risk) => {
  return {
    success: true,
    data: {
      problem: problem,
      type: type,
      confidence: confidence,
      severity: severity,
      technical_analysis: analysisArr,
      solution_steps: solArr,
      estimated_cost_effort: estimate,
      risk_assessment: risk
    }
  };
};

module.exports = {
  analyzeHardware: (filename) => {
    const name = filename.toLowerCase();
    
    if (name.includes('pipe')) {
      return generateResponse("Pipe Leakage Detected", "Hardware", "98%", "High", 
        ["Visible rupture in PVC joint.", "Water droplet formation indicates high-pressure seal failure."], 
        ["Isolate water supply via main shut-off valve.", "Empty remaining water pressure from the tap.", "Replace joint sealing with PVC cement or plumber's tape."], 
        "$50 - $150 (If plumber hired)", "High risk of localized flooding and water damage to sub-floor.");
    } else if (name.includes('cable') || name.includes('wire')) {
      return generateResponse("Damaged / Burnt Wire Insulation", "Hardware", "99%", "Critical", 
        ["Outer thermoplastic insulation sleeve eroded.", "Copper core completely exposed to environmental oxygen.", "Localized charring indicates heat due to high resistance."], 
        ["Trip the main circuit breaker immediately.", "Do NOT touch wires without insulated electrical gloves.", "Snip wire past the burn and splice new insulated connector."], 
        "$15 (Wire splice tools)", "Extreme fire and electrocution hazard.");
    } else if (name.includes('plug')) {
      return generateResponse("Burnt Appliance Plug", "Hardware", "97%", "Critical", 
        ["Carbon scoring localized around grounding pin.", "Plastic molding melted from internal arcing."], 
        ["Unplug carefully using insulated grips if active.", "Do not re-use. Snip the plug off entirely.", "Wire a new standard 3-prong plug to the cord."], 
        "$10 (Replacement Plug)", "Extreme fire hazard due to electrical arcing.");
    } else if (name.includes('plant')) {
      return generateResponse("Plant Disease / Cellular Necrosis", "Hardware / biological", "92%", "Medium", 
        ["Brown circular lesions conform to fungal infection patterns.", "Yellow halos indicate surrounding cellular death."], 
        ["Isolate plant from other vegetation.", "Prune infected leaves strictly.", "Apply broad-spectrum copper fungicide to soil and stems."], 
        "$15 (Fungicide Treatment)", "High risk of spreading to neighboring crops or roots.");
    } else if (name.includes('screen')) {
      return generateResponse("Cracked Display Panel", "Hardware", "99%", "Low", 
        ["Spiderweb fracture radiating from impact point.", "Underlying LCD/OLED substrate appears intact.", "Capacitive touch digitizer remains responsive."], 
        ["Wipe clean of glass dust.", "Apply clear packing tape over screen to mitigate glass splinter hazard.", "Order replacement OEM display assembly."], 
        "$80 - $250 (Varies by model)", "Risk of micro-shards embedding in fingers.");
    } else if (name.includes('ransom') || name.includes('hack') || name.includes('lock')) {
      return generateResponse("Ransomware Infection", "Cybersecurity", "100%", "Critical", 
        ["Military-grade encryption applied to host file system.", "Network worms actively spreading payload over port 445.", "Cryptocurrency extortion interface overlaid on desktop."], 
        ["Instantly disconnect Ethernet/WiFi to air-gap the machine.", "Do NOT pay the ransom.", "Reformat drive and restore from offline immutable backups.", "Report incident to local cyber authorities."], 
        "Catastrophic Data Loss", "Complete compromise of personal identity and financial extortion.");
    } else if (name.includes('bsod') || name.includes('blue') || name.includes('crash')) {
      return generateResponse("Windows Stop Code (BSOD)", "Software System", "95%", "High", 
        ["CRITICAL_PROCESS_DIED indicates a crucial system kernel process terminated.", "Likely caused by corrupted registry keys, faulty RAM, or malicious driver injection."], 
        ["Hold power button to hard reset the machine.", "Boot Windows into Safe Mode.", "Run `sfc /scannow` and `DISM` in Administrator Command Prompt.", "Rollback recent Windows Updates."], 
        "1-3 Hours", "Spontaneous rebooting and potential corruption of the OS mapped drive.");
    } else {
      return generateResponse("Unidentified Hardware Object", "Hardware", "Unknown", "Unknown", 
        ["Data structure lacks sufficient topology mapping to identify image."], 
        ["Upload a clearer photograph.", "Ensure the object is well-lit."], 
        "N/A", "Unknown");
    }
  },

  analyzeCode: (textInput) => {
    const text = String(textInput).toLowerCase();
    
    // Default fallback
    let result = {
      problem: "Generic Exception Handler",
      type: "Software",
      confidence: "Unknown",
      severity: "Low",
      technical_analysis: ["Unable to map exact vulnerability without stack trace details."],
      solution_steps: ["Please provide the entire stack trace log.", "Include the code snippet where it crashed."],
      risk_assessment: "N/A",
      estimated_cost_effort: "Unknown",
      fixed_code: "// Provide specific code snippet for auto-generation formatting",
      optimization_suggestions: ["Provide specific language context to get suggestions"],
      difficulty_level: "N/A",
      estimated_fix_time: "N/A"
    };

    if (text.includes('while (true)') || text.includes('timeout') || text.includes('infinite loop')) {
      result = {
        problem: "Infinite Loop / Thread Lock",
        type: "Software",
        confidence: "95%",
        severity: "Critical",
        technical_analysis: [
          "Iteration mechanism lacks a break condition or mathematical increment.",
          "Synchronous call blocks the main thread from processing parallel operations."
        ],
        solution_steps: [
          "Force quit the process node/browser.",
          "Review the 'while' or 'for' loop breaking condition logic.",
          "Ensure index increments correctly (i.e., `i++`)."
        ],
        risk_assessment: "Memory leak leading to 100% CPU utilization and app crash.",
        estimated_cost_effort: "1 Developer Hour",
        fixed_code: "let count = 0;\nwhile (count < 10) {\n  console.log('Processing dynamically safely...');\n  count++;\n}",
        optimization_suggestions: ["Use async/await loop if waiting for I/O.", "Set an upper-bound iteration limit safeguard."],
        difficulty_level: "Beginner",
        estimated_fix_time: "5 minutes"
      };
    } else if (text.includes('null') || text.includes('undefined')) {
      result = {
        problem: "Null Pointer Dereference",
        type: "Software",
        confidence: "98%",
        severity: "High",
        technical_analysis: [
          "Attempting to invoke property on an uninitialized memory block.",
          "Variable scope evaluates to Undefined leading to runtime Type Error."
        ],
        solution_steps: [
          "Trace the variable assignment back to its origin.",
          "Implement Optional Chaining (?.).",
          "Ensure API promises resolve before property extraction."
        ],
        risk_assessment: "Immediate script execution termination blocking subsequent rendering.",
        estimated_cost_effort: "0.5 Developer Hours",
        fixed_code: "const userProfile = null;\n// IMPLEMENT OPTIONAL CHAINING \nconst userName = userProfile?.name || 'Guest User';\nconsole.log(userName);",
        optimization_suggestions: ["Add Typescript interfaces to catch nulls at compile time.", "Add default fallback destructurings."],
        difficulty_level: "Beginner",
        estimated_fix_time: "2 minutes"
      };
    } else if (text.includes('syntax') || text.includes('unexpected') || text.includes('token')) {
      result = {
        problem: "Syntax Parsing Error",
        type: "Software",
        confidence: "90%",
        severity: "Medium",
        technical_analysis: [
          "Compiler cannot build AST due to malformed lexical tokens.",
          "Likely an unclosed bracket, missing comma, or illegal reserved keyword."
        ],
        solution_steps: [
          "Check the stack trace for the exact line and column number.",
          "Use a linter (e.g., ESLint) in your IDE."
        ],
        risk_assessment: "Complete build failure. Application cannot be deployed.",
        estimated_cost_effort: "0.2 Developer Hours",
        fixed_code: "if (user === 'admin') { // Missing bracket added\n  console.log('Access Granted');\n}",
        optimization_suggestions: ["Format Document automatically on Save in VSCode.", "Configure Prettier rules in project."],
        difficulty_level: "Trivial",
        estimated_fix_time: "1 minute"
      };
    }

    return { success: true, data: result };
  },

  chat: (query, data) => {
    let response = "I am the advanced AI Problem Solver. Describe your hardware or software problem.";
    const text = String(query).toLowerCase();

    if (data && data.problem) {
      const isHardware = (String(data.type).toLowerCase() === 'hardware');

      if (text.includes('repair') || text.includes('fix')) {
        response = `To repair the [${data.problem}], please follow these steps:\n- ${data.solution_steps.join('\n- ')}\n\nExpected cost/effort: ${data.estimated_cost_effort}.`;
      } else if (text.includes('why') || text.includes('reason') || text.includes('happen')) {
        response = `The [${data.problem}] happened because of the following root causes:\n- ${data.technical_analysis.join('\n- ')}`;
      } else if (text.includes('safe') || text.includes('ignore')) {
        response = `This is strictly NOT safe to ignore. The severity is marked as [${data.severity.toUpperCase()}].\n\nRisk Assessment:\n${data.risk_assessment}\n\nImmediate rectification is highly recommended.`;
      } else if (text.includes('tool') || text.includes('skill')) {
        if (isHardware) {
          response = `To fix this, you will need physical repair tools appropriate for [${data.problem}]. Beginner-to-intermediate DIY skills are required. Also, prepare exactly the replacement parts listed in the Cost Estimate section (${data.estimated_cost_effort}).`;
        } else {
          response = `No physical tools are needed. You will require an IDE debugger, access to the source code, and intermediate ${data.type} logic skills to properly step through the execution trace and patch the flaw.`;
        }
      } else if (text.includes('simpl') || text.includes('risk')) {
        if (isHardware) {
          response = `In simple terms: The physical structure of [${data.problem.toLowerCase()}] is actively degrading. If you don't replace or patch it, the object will completely break and could cause severe secondary damage.`;
        } else {
          response = `In simple terms: The code architecture for [${data.problem.toLowerCase()}] is broken. If you don't rewrite it, the program will simply crash, loop infinitely, or freeze when users try to interact with it.`;
        }
      } else if (text.includes('optimiz')) {
        response = `To optimize this code further, review these suggestions:\n- ${data.optimization_suggestions.join('\n- ')}`;
      } else {
        response = `Context acknowledged: ${data.problem}. Please select a question from the menu.`;
      }
    } else {
      if (text.includes('hi') || text.includes('hello')) response = "Hello! I am ready to solve anything. Paste some code or upload an image of damaged hardware!";
    }

    return { success: true, data: { response: response } };
  }
};
