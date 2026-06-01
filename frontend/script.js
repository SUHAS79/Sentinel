// script.js (Workbench Logic V12 - Handle Three Comparison Zones)
// Works with app.py V17

document.addEventListener('DOMContentLoaded', () => {
    const voterGallery = document.getElementById('voter-gallery');
    const compareBtn = document.getElementById('compare-btn');
    const selectionCounter = document.getElementById('selection-counter');
    const resultsContainer = document.getElementById('comparison-results-container');
    const setupInstruction = document.getElementById('setup-instruction'); 
    
    const API_URL = 'http://127.0.0.1:5000';
    let selectedFiles = [];

    // --- UI LOGIC ---
    async function loadVoters() {
        try {
            const response = await fetch(`${API_URL}/get_voters`);
            if (!response.ok) {
                 let errorMsg = `Server responded with status: ${response.status}`;
                 try { const errorData = await response.json(); if (errorData && errorData.error) errorMsg = errorData.error; } 
                 catch (parseError) { /* Ignore */ }
                 throw new Error(errorMsg);
            }
            const files = await response.json();
            
            voterGallery.innerHTML = ''; 
            if (!files || files.error) {
                 voterGallery.innerHTML = `<p class="col-span-full text-red-400 text-center">${files.error || 'Unknown error fetching files.'}</p>`;
                 return;
            }
            if (files.length === 0) {
                voterGallery.innerHTML = `<p class="col-span-full text-gray-400 text-center">No images found in 'voter_image_pool'.</p>`;
                 if (setupInstruction) setupInstruction.classList.remove('hidden'); 
                return;
            }
            if (setupInstruction) setupInstruction.classList.add('hidden'); 

            files.forEach(filename => {
                const card = document.createElement('div');
                card.className = 'voter-card bg-gray-700 border-4 border-transparent rounded-xl overflow-hidden'; 
                card.dataset.filename = filename;
                card.innerHTML = `
                    <img src="${API_URL}/images/${filename}" alt="${filename}" class="w-full h-40 object-cover" 
                         onerror="this.onerror=null; this.src='https://placehold.co/300x300/1f2937/9ca3af?text=Load+Error'; this.alt='Error loading image';">
                    <p class="p-2 text-sm truncate text-center">${filename}</p> 
                `;
                card.addEventListener('click', () => handleSelection(card));
                voterGallery.appendChild(card);
            });
        } catch (err) {
            console.error('Failed to load voters:', err);
             voterGallery.innerHTML = `<div class="col-span-full alert alert-error"><p><strong>Error:</strong> Could not connect to the backend server at <code>${API_URL}</code> or failed to load images. Please ensure the Python server (app.py) is running correctly in the 'backend' folder and refresh the page.</p><p class="text-xs mt-2">Details: ${err.message}</p></div>`; 
        }
    }


    function handleSelection(card) {
         const filename = card.dataset.filename;
        if (selectedFiles.includes(filename)) {
            selectedFiles = selectedFiles.filter(f => f !== filename);
            card.classList.remove('selected');
        } else if (selectedFiles.length < 2) {
            selectedFiles.push(filename);
            card.classList.add('selected');
        }
        selectionCounter.textContent = `${selectedFiles.length}/2 Selected`;
        compareBtn.disabled = selectedFiles.length !== 2;
        if (selectedFiles.length < 2) {
             resultsContainer.innerHTML = `<p class="text-center text-gray-500 py-8">Select two images and click "Compare Images" to see results.</p>`;
        }
    }


    // --- UPDATED V12: displayResult - Handles MATCH, POTENTIAL_MATCH, NO_MATCH ---
    function displayResult(data, error = null, customMessage = null) {
        console.log("Data received by displayResult:", JSON.stringify(data)); 
        
        resultsContainer.innerHTML = ''; 
        const resultCard = document.createElement('div');
        resultCard.className = 'bg-gray-800 rounded-lg p-6 border border-gray-700'; 
        
        let resultHTML = '';
        if (error) {
            // Display error using alert styles
            resultHTML = `<div class="alert alert-error">
                 <p><strong>Error: ${error}</strong></p>
                 ${customMessage ? `<p class="mt-1 text-sm">${customMessage}</p>` : ''}
             </div>`;
        } 
        // ** UPDATED CHECK **: Check for similarity and the NEW match_status field
        else if (data && typeof data.similarity === 'number' && data.match_status && data.file1 && data.file2) {
            
            const similarityScore = data.similarity.toFixed(4); 
            const matchThreshold = data.threshold; // e.g., 0.75
            const potentialThreshold = data.potential_threshold; // e.g., 0.4
            const matchStatus = data.match_status; // "MATCH", "POTENTIAL_MATCH", "NO_MATCH"

            // --- Determine display based on match_status ---
            let statusText = "UNKNOWN";
            let statusColorClass = "text-gray-400"; // Default color

            if (matchStatus === "MATCH") {
                 statusText = "✓ MATCH DETECTED";
                 statusColorClass = "text-green-400";
            } else if (matchStatus === "POTENTIAL_MATCH") {
                 statusText = "⚠ POTENTIAL MATCH (Requires Review)";
                 statusColorClass = "text-yellow-400"; // Use warning color for potential
            } else if (matchStatus === "NO_MATCH") {
                 statusText = "✗ NO MATCH";
                 statusColorClass = "text-orange-400"; // Use a distinct color for definite no match (using orange from CSS)
            }
            // --- End Status Determination ---

            resultHTML = `
                <!-- Display filenames -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <div><p class="font-semibold text-white truncate" title="${data.file1.filename}">${data.file1.filename}</p></div>
                    <div><p class="font-semibold text-white truncate" title="${data.file2.filename}">${data.file2.filename}</p></div>
                </div>
                 <!-- Display the comparison metrics -->
                <div class="border-t border-gray-700 pt-4 text-center">
                    <p class="text-lg text-gray-400">Cosine Similarity Score: <span class="font-bold text-white">${similarityScore}</span> 
                       <!-- Display thresholds clearly -->
                       <span class="text-sm block mt-1">(Thresholds: Match >= ${matchThreshold}, Potential >= ${potentialThreshold})</span> 
                    </p>
                    <!-- Display the determined status text and color -->
                    <p class="text-3xl font-bold mt-2 ${statusColorClass}"> 
                        ${statusText}
                    </p>
                </div>`;
        } else {
             // Handle cases where backend response is missing expected data
             resultHTML = `<div class="alert alert-error">
                 <p><strong>Error: Invalid Response Structure</strong></p>
                 <p class="mt-1 text-sm">Received data from the backend is incomplete or in an unexpected format (e.g., 'similarity' or 'match_status' might be missing). Cannot display result.</p>
             </div>`;
             console.error("Invalid data structure received for display:", data); 
        }
        
        resultCard.innerHTML = resultHTML;
        resultsContainer.appendChild(resultCard);
    }
    // --- END UPDATED FUNCTION ---

    compareBtn.addEventListener('click', async () => {
         if (selectedFiles.length !== 2) return;
         const originalButtonHTML = compareBtn.innerHTML;
         compareBtn.innerHTML = `<span>Comparing...</span><span class="spinner"></span>`;
         compareBtn.disabled = true;
         resultsContainer.innerHTML = `<div class="text-center py-8 text-gray-400">Processing...<div class="spinner !inline-block ml-2"></div></div>`; 

        try {
            const response = await fetch(`${API_URL}/compare`, { 
                 method: 'POST',
                 headers: { 'Content-Type': 'application/json' },
                 body: JSON.stringify({ file1: selectedFiles[0], file2: selectedFiles[1] }) 
            });
            
            const responseText = await response.text();
            console.log("Raw response text from backend:", responseText); // Keep logging raw response
            let data = {};
            try { data = JSON.parse(responseText); } 
            catch (jsonError) { throw new Error(`Invalid JSON: ${responseText.substring(0, 100)}...`); }

            if (!response.ok) {
                 // Error handling for non-OK response
                 let userMessage = data.error || `Server responded with status ${response.status}`;
                 let customDetail = 'Check backend logs.';
                 if (response.status === 400 && data.error && (data.error.includes("Could not process") || data.error.includes("No clear face"))) { 
                      userMessage = `AI Processing Failed`; customDetail = data.error; 
                  } else if (response.status === 404 && data.error && data.error.includes("File not found")) {
                       userMessage = `Image File Not Found`; customDetail = data.error; 
                  }
                 displayResult(null, userMessage, customDetail); // Calls updated displayResult
            } else {
                displayResult(data); // Calls updated displayResult
            }
        } catch (err) { 
             console.error('API Error or JSON Parse Error:', err);
             displayResult(null, 'Connection or Data Error', `Details: ${err.message}`); // Simplified error
        } finally { 
             // Restore button and clear selection
             compareBtn.innerHTML = originalButtonHTML;
             selectedFiles = []; 
             document.querySelectorAll('.voter-card.selected').forEach(card => card.classList.remove('selected'));
             selectionCounter.textContent = '0/2 Selected';
             compareBtn.disabled = true; 
        }
    });
    
    // Initial load
    loadVoters();
});

