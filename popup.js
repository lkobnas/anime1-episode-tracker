document.addEventListener("DOMContentLoaded", function () {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        // Get the current URL and extract the anime ID
        const url = new URL(tabs[0].url);
        const animeId = url.pathname.split('/').filter(segment => segment).pop();

        // Get the anime data from storage
        chrome.storage.local.get('animeData', (result) => {
            let animeTitle = document.getElementById("animeTitle");
            let episodeNumber = document.getElementById("episodeNumber");
            let remainingTime = document.getElementById("remainingTime");

            if (animeTitle && episodeNumber && remainingTime) {
                if (result.animeData && result.animeData[animeId]) {
                    const animeData = result.animeData[animeId];
                    animeTitle.textContent = animeData.title || "Unknown";
                    episodeNumber.textContent = animeData.episode || "Unknown";
                    remainingTime.textContent = animeData.remainingTime || "Unknown";
                } else {
                    animeTitle.textContent = "No data";
                    episodeNumber.textContent = "No data";
                    remainingTime.textContent = "No data";
                }
            }
        });
    });
});
