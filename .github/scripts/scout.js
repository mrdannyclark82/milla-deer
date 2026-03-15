const axios = require('axios');

const KEYWORDS = ['ai', 'node', 'monorepo', 'typescript', 'javascript', 'react', 'vue', 'llm', 'agent'];

async function fetchGitHubTrending() {
    try {
        // Note: Using a proxy/scraper for trending is more stable than GitHub's raw HTML.
        // This is a public, unauthenticated API endpoint that scrapes the trending page.
        const response = await axios.get('https://api.gitterapp.com/repositories');
        const repos = response.data;
        
        const filtered = repos.filter(repo => 
            KEYWORDS.some(keyword => 
                (repo.name.toLowerCase().includes(keyword) || 
                 (repo.description && repo.description.toLowerCase().includes(keyword)) ||
                 (repo.language && repo.language.toLowerCase().includes(keyword))))
        );
        
        let report = '###  tendencias en GitHub\\n\\n';
        if (filtered.length > 0) {
            filtered.slice(0, 5).forEach(repo => {
                report += `- **[${repo.name}](${repo.url})**: ${repo.description}\\n`;
            });
        } else {
            report += '- No se encontraron repositorios relevantes en tendencia.\\n';
        }
        return report;
    } catch (error) {
        console.error('Error fetching GitHub trending:', error.message);
        return '### GitHub Trending\\n- Could not fetch data.\\n';
    }
}

async function fetchHackerNews() {
    try {
        const topStoriesResponse = await axios.get('https://hacker-news.firebaseio.com/v0/topstories.json');
        const topStoryIds = topStoriesResponse.data.slice(0, 30);
        
        let report = '### Top de Hacker News\\n\\n';
        let found = 0;

        for (const id of topStoryIds) {
            if (found >= 5) break;
            const storyResponse = await axios.get(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
            const story = storyResponse.data;

            if (story && story.title && KEYWORDS.some(keyword => story.title.toLowerCase().includes(keyword))) {
                report += `- [${story.title}](${story.url || `https://news.ycombinator.com/item?id=${id}`})\\n`;
                found++;
            }
        }
        if (found === 0) {
            report += '- No se encontraron historias relevantes.\\n';
        }
        return report;

    } catch (error) {
        console.error('Error fetching Hacker News:', error.message);
        return '### Hacker News Top\\n- Could not fetch data.\\n';
    }
}

async function generateReport() {
    const githubReport = await fetchGitHubTrending();
    const hnReport = await fetchHackerNews();
    
    const finalReport = `# Radar Tecnológico 🚀\\n\\nAquí tienes un resumen de las últimas tendencias y tecnologías que podrían ser relevantes para este repositorio, encontradas el ${new Date().toDateString()}:\\n\\n${githubReport}\\n${hnReport}`;
    
    // Outputting the report in a way that GitHub Actions can easily capture it
    console.log(finalReport);
}

generateReport();
