(function () {
    function saveLastWatched(title, episode, remainingTime) {
        chrome.storage.local.set({ lastWatched: { title, episode, remainingTime } }, () => {
            console.log(`Saved: ${title} - [${episode}], Remaining Time: ${remainingTime}`);
        });
    }

    let previousState = null;

    function findCurrentEpisode() {

        let articles = document.querySelectorAll("article");

        let titleElement = null;
        let remainingTimeElement = null;
        setTimeout(() => {
        
        articles.forEach(article => {
            let videoPlayer = article.querySelector(".video-js");
            if (!videoPlayer) return;
    
            let observer = new MutationObserver(() => {
                let isPlaying = videoPlayer.classList.contains("vjs-playing");
                let status = isPlaying ? "Playing" : "Paused";
                //console.log(`Status: ${status}`);
                if (status === "Playing") {
                    titleElement = article.querySelector("header h2 a");
                    console.log(titleElement.textContent);
                    remainingTimeElement = article.querySelector(".vjs-remaining-time-display");
    
                    if (titleElement) {// && remainingTimeElement) {
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
                
            });
    
            observer.observe(videoPlayer, { attributes: true, attributeFilter: ["class"] });
        });

    }, 100);

    }

    // Run every 5 seconds to check which episode is being watched
    setInterval(findCurrentEpisode, 5000);
})();
