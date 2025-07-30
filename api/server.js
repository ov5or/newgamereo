const WebSocket = require('ws');
const crypto = require('crypto');
const http = require('http');

const PORT = process.env.PORT || 8000;

const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
    
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Quiz Game Server Running');
});

const wss = new WebSocket.Server({ 
    server: server,
    perMessageDeflate: false
});

const parties = new Map();
const players = new Map();

const questionsDB = {
    en: {
        general: [
            { text: "What is the capital of France?", answer: "Paris", difficulty: "easy", options: ["London", "Berlin", "Paris", "Madrid"] },
            { text: "Who painted the Mona Lisa?", answer: "Leonardo da Vinci", difficulty: "hard", options: ["Picasso", "Leonardo da Vinci", "Van Gogh", "Michelangelo"] },
            { text: "What is 2 + 2?", answer: "4", difficulty: "easy", options: ["3", "4", "5", "6"] },
            { text: "What is the largest planet?", answer: "Jupiter", difficulty: "easy", options: ["Earth", "Jupiter", "Saturn", "Mars"] },
            { text: "In which year did WWII end?", answer: "1945", difficulty: "hard", options: ["1944", "1945", "1946", "1947"] },
            { text: "What is the speed of light?", answer: "299792458", difficulty: "impossible", options: ["299792458", "300000000", "299000000", "301000000"] },
            { text: "Who wrote Romeo and Juliet?", answer: "Shakespeare", difficulty: "hard", options: ["Dickens", "Shakespeare", "Austen", "Wilde"] },
            { text: "What is H2O?", answer: "Water", difficulty: "easy", options: ["Oxygen", "Water", "Hydrogen", "Carbon"] },
            { text: "How many continents are there?", answer: "7", difficulty: "easy", options: ["5", "6", "7", "8"] },
            { text: "What is the smallest country?", answer: "Vatican City", difficulty: "hard", options: ["Monaco", "Vatican City", "San Marino", "Liechtenstein"] }
        ],
        sports: [
            { text: "How many players in a football team?", answer: "11", difficulty: "easy", options: ["10", "11", "12", "9"] },
            { text: "Where were the 2020 Olympics held?", answer: "Tokyo", difficulty: "easy", options: ["Tokyo", "London", "Paris", "Beijing"] },
            { text: "Who won the 2018 FIFA World Cup?", answer: "France", difficulty: "hard", options: ["Germany", "Brazil", "France", "Argentina"] },
            { text: "What sport is Wimbledon associated with?", answer: "Tennis", difficulty: "easy", options: ["Golf", "Tennis", "Cricket", "Rugby"] },
            { text: "How many holes in a standard golf course?", answer: "18", difficulty: "easy", options: ["16", "18", "20", "22"] }
        ],
        geography: [
            { text: "What is the longest river?", answer: "Nile", difficulty: "hard", options: ["Amazon", "Nile", "Mississippi", "Yangtze"] },
            { text: "Which desert is the largest?", answer: "Sahara", difficulty: "easy", options: ["Gobi", "Sahara", "Kalahari", "Mojave"] },
            { text: "What is the highest mountain?", answer: "Everest", difficulty: "easy", options: ["K2", "Everest", "Kilimanjaro", "Denali"] },
            { text: "Which country has the most time zones?", answer: "Russia", difficulty: "hard", options: ["USA", "China", "Russia", "Canada"] },
            { text: "What is the smallest ocean?", answer: "Arctic", difficulty: "hard", options: ["Indian", "Arctic", "Atlantic", "Antarctic"] }
        ],
        science: [
            { text: "What is the chemical symbol for gold?", answer: "Au", difficulty: "hard", options: ["Go", "Au", "Ag", "Al"] },
            { text: "How many bones in the human body?", answer: "206", difficulty: "impossible", options: ["204", "206", "208", "210"] },
            { text: "What gas do plants absorb?", answer: "Carbon Dioxide", difficulty: "easy", options: ["Oxygen", "Carbon Dioxide", "Nitrogen", "Hydrogen"] },
            { text: "What is the hardest natural substance?", answer: "Diamond", difficulty: "hard", options: ["Gold", "Iron", "Diamond", "Platinum"] },
            { text: "How many chambers does a human heart have?", answer: "4", difficulty: "easy", options: ["2", "3", "4", "5"] }
        ],
        history: [
            { text: "When did the Berlin Wall fall?", answer: "1989", difficulty: "hard", options: ["1987", "1988", "1989", "1990"] },
            { text: "Who was the first person on the moon?", answer: "Neil Armstrong", difficulty: "easy", options: ["Buzz Aldrin", "Neil Armstrong", "John Glenn", "Alan Shepard"] },
            { text: "Which empire built Machu Picchu?", answer: "Inca", difficulty: "hard", options: ["Aztec", "Maya", "Inca", "Olmec"] },
            { text: "When did WWI start?", answer: "1914", difficulty: "hard", options: ["1912", "1913", "1914", "1915"] },
            { text: "Who painted the Sistine Chapel?", answer: "Michelangelo", difficulty: "hard", options: ["Leonardo", "Michelangelo", "Raphael", "Donatello"] }
        ]
    },
    ar: {
        general: [
            { text: "ما عاصمة فرنسا؟", answer: "باريس", difficulty: "easy", options: ["لندن", "برلين", "باريس", "مدريد"] },
            { text: "من رسم الموناليزا؟", answer: "ليوناردو دا فينشي", difficulty: "hard", options: ["بيكاسو", "ليوناردو دا فينشي", "فان جوخ", "مايكل أنجلو"] },
            { text: "كم يساوي 2 + 2؟", answer: "4", difficulty: "easy", options: ["3", "4", "5", "6"] },
            { text: "ما أكبر كوكب؟", answer: "المشتري", difficulty: "easy", options: ["الأرض", "المشتري", "زحل", "المريخ"] },
            { text: "في أي عام انتهت الحرب العالمية الثانية؟", answer: "1945", difficulty: "hard", options: ["1944", "1945", "1946", "1947"] }
        ],
        sports: [
            { text: "كم لاعب في فريق كرة القدم؟", answer: "11", difficulty: "easy", options: ["10", "11", "12", "9"] },
            { text: "أين أقيمت أولمبياد 2020؟", answer: "طوكيو", difficulty: "easy", options: ["طوكيو", "لندن", "باريس", "بكين"] },
            { text: "من فاز بكأس العالم 2018؟", answer: "فرنسا", difficulty: "hard", options: ["ألمانيا", "البرازيل", "فرنسا", "الأرجنتين"] }
        ],
        geography: [
            { text: "ما أطول نهر في العالم؟", answer: "النيل", difficulty: "hard", options: ["الأمازون", "النيل", "المسيسيبي", "اليانغتسي"] },
            { text: "ما أكبر صحراء؟", answer: "الصحراء الكبرى", difficulty: "easy", options: ["جوبي", "الصحراء الكبرى", "كالاهاري", "موهافي"] }
        ],
        science: [
            { text: "ما الرمز الكيميائي للذهب؟", answer: "Au", difficulty: "hard", options: ["Go", "Au", "Ag", "Al"] },
            { text: "أي غاز تمتصه النباتات؟", answer: "ثاني أكسيد الكربون", difficulty: "easy", options: ["الأكسجين", "ثاني أكسيد الكربون", "النيتروجين", "الهيدروجين"] }
        ],
        history: [
            { text: "متى سقط جدار برلين؟", answer: "1989", difficulty: "hard", options: ["1987", "1988", "1989", "1990"] },
            { text: "من أول شخص على القمر؟", answer: "نيل أرمسترونغ", difficulty: "easy", options: ["باز ألدرين", "نيل أرمسترونغ", "جون جلين", "آلان شيبارد"] }
        ]
    }
};

function generatePartyCode() {
    return crypto.randomBytes(3).toString('hex').toUpperCase();
}

function createParty(host, playerCount, language, category, difficulty) {
    const code = generatePartyCode();
    const party = {
        code,
        host,
        maxPlayers: playerCount,
        language,
        category,
        difficulty,
        players: [],
        status: 'waiting',
        createdAt: Date.now(),
        expiresAt: Date.now() + (5 * 60 * 1000),
        game: null
    };
    
    parties.set(code, party);
    setTimeout(() => {
        if (parties.has(code) && parties.get(code).status === 'waiting') {
            startGameAuto(code);
        }
    }, 5 * 60 * 1000);
    
    return party;
}

function joinParty(partyCode, player) {
    const party = parties.get(partyCode);
    if (!party) throw new Error('Party not found');
    if (party.status !== 'waiting') throw new Error('Game already started');
    if (party.players.length >= party.maxPlayers) throw new Error('Party full');
    if (party.players.find(p => p.username === player.username)) throw new Error('Username taken');
    
    party.players.push(player);
    return party;
}

function startGame(partyCode, force = false) {
    const party = parties.get(partyCode);
    if (!party) throw new Error('Party not found');
    if (!force && party.players.length < 2) throw new Error('Need at least 2 players');
    
    const questions = getRandomQuestions(party.language, party.category, party.difficulty, 10);
    party.game = {
        questions,
        currentQuestion: 0,
        answers: new Map(),
        scores: new Map(),
        phase: 'text'
    };
    
    party.players.forEach(player => {
        party.game.scores.set(player.username, 0);
    });
    
    party.status = 'playing';
    return party;
}

function startGameAuto(partyCode) {
    const party = parties.get(partyCode);
    if (party && party.status === 'waiting' && party.players.length >= 1) {
        startGame(partyCode, true);
        broadcastToParty(partyCode, { type: 'gameStarted', game: party.game });
        sendQuestion(partyCode);
    }
}

function getRandomQuestions(language, category, difficulty, count) {
    const langQuestions = questionsDB[language] || questionsDB['en'];
    let categoryQuestions = langQuestions[category] || langQuestions['general'];
    
    if (difficulty !== 'random') {
        const filtered = categoryQuestions.filter(q => q.difficulty === difficulty);
        if (filtered.length > 0) categoryQuestions = filtered;
    }
    
    const shuffled = [...categoryQuestions].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, Math.min(count, shuffled.length));
}

function sendQuestion(partyCode) {
    const party = parties.get(partyCode);
    if (!party || !party.game) return;
    
    const question = party.game.questions[party.game.currentQuestion];
    if (!question) {
        endGame(partyCode);
        return;
    }
    
    party.game.phase = 'text';
    party.game.answers.clear();
    
    broadcastToParty(partyCode, {
        type: 'question',
        question: {
            text: question.text,
            difficulty: question.difficulty
        },
        questionNumber: party.game.currentQuestion + 1
    });
    
    setTimeout(() => {
        if (party.game.phase === 'text') {
            party.game.phase = 'options';
            sendOptions(partyCode);
        }
    }, 10000);
}

function sendOptions(partyCode) {
    const party = parties.get(partyCode);
    if (!party || !party.game) return;
    
    const question = party.game.questions[party.game.currentQuestion];
    const playerAnswers = Array.from(party.game.answers.values());
    const wrongAnswers = playerAnswers.filter(a => a.toLowerCase() !== question.answer.toLowerCase());
    
    let options = [...question.options];
    if (wrongAnswers.length > 0) {
        options = options.slice(0, 4 - wrongAnswers.length).concat(wrongAnswers.slice(0, 4));
    }
    
    options = options.sort(() => 0.5 - Math.random()).slice(0, 5);
    if (!options.includes(question.answer)) {
        options[Math.floor(Math.random() * options.length)] = question.answer;
    }
    
    broadcastToParty(partyCode, {
        type: 'question',
        question: {
            text: question.text,
            difficulty: question.difficulty,
            options: options
        },
        questionNumber: party.game.currentQuestion + 1
    });
    
    setTimeout(() => {
        processAnswers(partyCode);
    }, 10000);
}

function submitAnswer(partyCode, username, answer) {
    const party = parties.get(partyCode);
    if (!party || !party.game) return;
    
    if (party.game.phase === 'text') {
        party.game.answers.set(username, answer);
    } else if (party.game.phase === 'options') {
        const question = party.game.questions[party.game.currentQuestion];
        const isCorrect = answer === question.answer || 
                         (Array.isArray(question.options) && question.options[answer] === question.answer);
        
        if (isCorrect) {
            const points = getPoints(question.difficulty);
            const currentScore = party.game.scores.get(username) || 0;
            party.game.scores.set(username, currentScore + points);
        }
    }
}

function processAnswers(partyCode) {
    const party = parties.get(partyCode);
    if (!party || !party.game) return;
    
    const question = party.game.questions[party.game.currentQuestion];
    const results = [];
    
    party.players.forEach(player => {
        const answer = party.game.answers.get(player.username);
        const isCorrect = answer && answer.toLowerCase() === question.answer.toLowerCase();
        const points = isCorrect ? getPoints(question.difficulty) : 0;
        
        if (isCorrect) {
            const currentScore = party.game.scores.get(player.username) || 0;
            party.game.scores.set(player.username, currentScore + points);
        }
        
        results.push({
            username: player.username,
            answer: answer,
            correct: isCorrect,
            points: points,
            totalScore: party.game.scores.get(player.username) || 0
        });
    });
    
    broadcastToParty(partyCode, {
        type: 'questionResults',
        results: results,
        correctAnswer: question.answer
    });
    
    setTimeout(() => {
        party.game.currentQuestion++;
        if (party.game.currentQuestion < party.game.questions.length) {
            sendQuestion(partyCode);
        } else {
            endGame(partyCode);
        }
    }, 3000);
}

function endGame(partyCode) {
    const party = parties.get(partyCode);
    if (!party) return;
    
    const results = party.players.map(player => ({
        username: player.username,
        score: party.game.scores.get(player.username) || 0
    })).sort((a, b) => b.score - a.score);
    
    broadcastToParty(partyCode, {
        type: 'gameEnded',
        results: { players: results }
    });
    
    party.status = 'finished';
    party.game = null;
    
    setTimeout(() => {
        generateNewPartyCode(partyCode);
    }, 30000);
}

function generateNewPartyCode(oldCode) {
    const party = parties.get(oldCode);
    if (!party) return;
    
    parties.delete(oldCode);
    const newCode = generatePartyCode();
    party.code = newCode;
    party.status = 'waiting';
    party.createdAt = Date.now();
    party.expiresAt = Date.now() + (5 * 60 * 1000);
    
    parties.set(newCode, party);
    
    broadcastToParty(newCode, {
        type: 'partyRegenerated',
        party: { code: newCode, players: party.players }
    });
    
    setTimeout(() => {
        if (parties.has(newCode) && parties.get(newCode).status === 'waiting') {
            deleteParty(newCode);
        }
    }, 30000);
}

function deleteParty(partyCode) {
    parties.delete(partyCode);
}

function getPoints(difficulty) {
    const points = { easy: 5, hard: 7, impossible: 9 };
    return points[difficulty] || 5;
}

function broadcastToParty(partyCode, message) {
    const party = parties.get(partyCode);
    if (!party) return;
    
    party.players.forEach(player => {
        if (player.socket && player.socket.readyState === WebSocket.OPEN) {
            player.socket.send(JSON.stringify(message));
        }
    });
}

function handlePractice(socket, data) {
    const questions = getRandomQuestions('en', data.category, data.difficulty, 10);
    socket.practiceGame = {
        questions,
        currentQuestion: 0,
        score: 0
    };
    
    sendPracticeQuestion(socket);
}

function sendPracticeQuestion(socket) {
    if (!socket.practiceGame) return;
    
    const question = socket.practiceGame.questions[socket.practiceGame.currentQuestion];
    if (!question) {
        socket.send(JSON.stringify({
            type: 'practiceEnded',
            score: socket.practiceGame.score
        }));
        return;
    }
    
    socket.send(JSON.stringify({
        type: 'question',
        question: {
            text: question.text,
            difficulty: question.difficulty
        },
        questionNumber: socket.practiceGame.currentQuestion + 1
    }));
    
    setTimeout(() => {
        socket.send(JSON.stringify({
            type: 'question',
            question: {
                text: question.text,
                difficulty: question.difficulty,
                options: question.options
            },
            questionNumber: socket.practiceGame.currentQuestion + 1
        }));
    }, 10000);
}

function handlePracticeAnswer(socket, answer) {
    if (!socket.practiceGame) return;
    
    const question = socket.practiceGame.questions[socket.practiceGame.currentQuestion];
    const isCorrect = answer.toLowerCase() === question.answer.toLowerCase();
    
    if (isCorrect) {
        socket.practiceGame.score += getPoints(question.difficulty);
    }
    
    socket.send(JSON.stringify({
        type: 'questionResults',
        correct: isCorrect,
        score: socket.practiceGame.score,
        difficulty: question.difficulty
    }));
    
    setTimeout(() => {
        socket.practiceGame.currentQuestion++;
        sendPracticeQuestion(socket);
    }, 3000);
}

wss.on('connection', (socket) => {
    console.log('New connection');
    
    socket.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            
            switch (message.type) {
                case 'ping':
                    socket.send(JSON.stringify({ type: 'pong', timestamp: message.timestamp }));
                    break;
                    
                case 'createParty':
                    const party = createParty(message.host, message.playerCount, message.language, message.category, message.difficulty);
                    const hostPlayer = { username: message.host, avatar: '👤', device: '💻', socket };
                    party.players.push(hostPlayer);
                    socket.send(JSON.stringify({ type: 'partyCreated', party }));
                    break;
                    
                case 'joinParty':
                    try {
                        const joinedParty = joinParty(message.partyCode, { ...message.player, socket });
                        socket.send(JSON.stringify({ type: 'partyJoined', party: joinedParty }));
                        broadcastToParty(message.partyCode, { 
                            type: 'playerJoined', 
                            players: joinedParty.players.map(p => ({ username: p.username, avatar: p.avatar, device: p.device }))
                        });
                    } catch (error) {
                        socket.send(JSON.stringify({ type: 'error', message: error.message }));
                    }
                    break;
                    
                case 'startGame':
                    try {
                        const gameParty = startGame(message.partyCode);
                        broadcastToParty(message.partyCode, { type: 'gameStarted', game: gameParty.game });
                        setTimeout(() => sendQuestion(message.partyCode), 2000);
                    } catch (error) {
                        socket.send(JSON.stringify({ type: 'error', message: error.message }));
                    }
                    break;
                    
                case 'submitAnswer':
                    submitAnswer(message.partyCode, message.player, message.answer);
                    break;
                    
                case 'submitOption':
                    submitAnswer(message.partyCode, message.player, message.option);
                    break;
                    
                case 'leaveParty':
                    const leaveParty = parties.get(message.partyCode);
                    if (leaveParty) {
                        leaveParty.players = leaveParty.players.filter(p => p.username !== message.player);
                        if (leaveParty.players.length === 0 || leaveParty.host === message.player) {
                            deleteParty(message.partyCode);
                        } else {
                            broadcastToParty(message.partyCode, { 
                                type: 'playerLeft', 
                                players: leaveParty.players.map(p => ({ username: p.username, avatar: p.avatar, device: p.device }))
                            });
                        }
                    }
                    break;
                    
                case 'startPractice':
                    handlePractice(socket, message);
                    break;
                    
                case 'practiceAnswer':
                case 'practiceOption':
                    handlePracticeAnswer(socket, message.answer || message.option);
                    break;
            }
        } catch (error) {
            console.error('Message error:', error);
            socket.send(JSON.stringify({ type: 'error', message: 'Invalid message' }));
        }
    });
    
    socket.on('close', () => {
        console.log('Connection closed');
        for (const [partyCode, party] of parties.entries()) {
            const playerIndex = party.players.findIndex(p => p.socket === socket);
            if (playerIndex !== -1) {
                const player = party.players[playerIndex];
                setTimeout(() => {
                    const currentParty = parties.get(partyCode);
                    if (currentParty && currentParty.players.find(p => p.username === player.username && !p.socket)) {
                        currentParty.players = currentParty.players.filter(p => p.username !== player.username);
                        if (currentParty.players.length === 0) {
                            deleteParty(partyCode);
                        }
                    }
                }, 30000);
                break;
            }
        }
    });
});

setInterval(() => {
    const now = Date.now();
    for (const [code, party] of parties.entries()) {
        if (party.expiresAt < now && party.status === 'waiting') {
            deleteParty(code);
        }
    }
}, 60000);

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Quiz Game Server running on port ${PORT}`);
});

process.on('SIGTERM', () => {
    console.log('Server shutting down');
    server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
    console.log('Server shutting down');
    server.close(() => process.exit(0));
});
