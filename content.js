(function () {
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    function saveLastWatched(title, episode, remainingTime) {
        // Get the anime identifier from the URL path
        const urlPath = window.location.pathname;
        const animeId = urlPath.split('/').filter(segment => segment).pop();

        // First, get existing data
        chrome.storage.local.get('animeData', (result) => {
            let animeData = result.animeData || {};
            
            // Update or add new entry for this specific anime
            animeData[animeId] = {
                title,
                episode,
                remainingTime,
                lastUpdated: Date.now()
            };

            // Save back to storage
            chrome.storage.local.set({ animeData }, () => {
                console.log(`Saved: ${title} - [${episode}], Remaining Time: ${remainingTime}`);
            });
        });
    }

    let previousState = null;

    function findCurrentEpisode() {

        let articles = document.querySelectorAll("article");

        let titleElement = null;
        let remainingTimeElement = null;
        
        articles.forEach(article => {
            let videoPlayer = article.querySelector(".video-js");
            if (!videoPlayer) return;
    
            let debouncedCallback = debounce(() => {
                let isPlaying = videoPlayer.classList.contains("vjs-playing");
                let status = isPlaying ? "Playing" : "Paused";
                //console.log(`Status: ${status}`);
                if (status === "Playing") {
                    titleElement = article.querySelector("header h2 a");
                    console.log(titleElement.textContent);
                    remainingTimeElement = article.querySelector(".vjs-remaining-time-display");
    
                    if (titleElement) {
                        let titleText = titleElement.textContent.trim();
                        let match = titleText.match(/(.+?)\s*\[(\d+)\]/);
                        let remainingTime = remainingTimeElement.textContent.trim();
            
                        if (match) {
                            let title = match[1];
                            let episode = match[2];
            
                            console.log(`Detected: ${title} - [${episode}], Remaining Time: ${remainingTime}`);
                            saveLastWatched(title, episode, remainingTime);
                        }
                    }
                }
            }, 300); // 300ms delay
    
            let observer = new MutationObserver(debouncedCallback);
            observer.observe(videoPlayer, { attributes: true, attributeFilter: ["class"] });
        });

    }

    function scrollToSavedEpisode() {
        const urlPath = window.location.pathname;
        const animeId = urlPath.split('/').filter(segment => segment).pop();

        chrome.storage.local.get('animeData', (result) => {
            if (!result.animeData || !result.animeData[animeId]) return;

            const savedData = result.animeData[animeId];
            const savedEpisode = savedData.episode;

            // Find the episode link that matches our saved episode
            const articles = document.querySelectorAll("article");
            articles.forEach(article => {
                const titleElement = article.querySelector("header h2 a");
                if (!titleElement) return;

                const match = titleElement.textContent.trim().match(/(.+?)\s*\[(\d+)\]/);
                if (match && match[2] === savedEpisode) {
                    // Smooth scroll to the element
                    article.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    
                    // Show a notification popup
                    showNotification(savedData);
                }
            });
        });
    }

    function showNotification(savedData) {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 15px;
            border-radius: 5px;
            z-index: 9999;
            font-family: Arial, sans-serif;
            max-width: 300px;
        `;

        notification.innerHTML = `
            <div style="margin-bottom: 8px"><strong>Last Watched:</strong></div>
            <div>Episode: ${savedData.episode}</div>
            <div>Remaining Time: ${savedData.remainingTime}</div>
        `;

        document.body.appendChild(notification);

        // Remove the notification after 5 seconds
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transition = 'opacity 0.5s ease';
            setTimeout(() => notification.remove(), 500);
        }, 5000);
    }

    // Call scrollToSavedEpisode when the page loads
    // Wait for the content to be fully loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', scrollToSavedEpisode);
    } else {
        scrollToSavedEpisode();
    }

    // Run every 5 seconds to check which episode is being watched
    setInterval(findCurrentEpisode, 5000);

    // Add this message listener near the top of your IIFE
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "showNotification") {
            const urlPath = window.location.pathname;
            const animeId = urlPath.split('/').filter(segment => segment).pop();

            chrome.storage.local.get('animeData', (result) => {
                if (result.animeData && result.animeData[animeId]) {
                    showNotification(result.animeData[animeId]);
                }
            });
        }
    });

})();
