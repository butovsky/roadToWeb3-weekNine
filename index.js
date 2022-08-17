const BigNumber = require('bignumber.js');
const qs = require('qs');
const web3 = require('web3');

let currentTrade = {};
let currentSelectSide;
let tokens;

const erc20abi = require('./erc20abi.json');

// challenge 6
// this can be put in state or smth
const networks = {
    "bsc.": {
        name: "Binance Smart Chain",
        list: 'binance-smart-chain'
    },
    "polygon.": {
        name: "Polygon",
        list: 'polygon-pos',
    },
    "optimism.": {
        name: "Optimism",
        list: 'optimistic-ethereum'
    },
}

async function init() {
    await listAvailableTokens();
    await listChains();
}


async function connect() {
    if (typeof window.ethereum !== "undefined") {
        try {
            console.log("connecting");
            await ethereum.request({ method: "eth_requestAccounts" });
        } catch (error) {
            console.log(error);
        }
        document.getElementById("login_button").innerHTML = "Connected";
        // const accounts = await ethereum.request({ method: "eth_accounts" });
        document.getElementById("swap_button").disabled = false;
    } else {
        document.getElementById("login_button").innerHTML = "Please install MetaMask";
    }
}

async function listChains() {
    const parent = document.getElementById("chain_select");
    for (const i in networks) {
        const option = document.createElement("option");
        option.innerHTML = networks[i].name,
        option.value = i;
        parent.appendChild(option);
    }
}

async function listAvailableTokens(){
    console.log("initializing");
    const chain = document.getElementById("chain_select").value;
    const tokenListEndpoint = networks[chain] ? networks[chain].list : 'uniswap';

    let response = await fetch(`https://tokens.coingecko.com/${tokenListEndpoint}/all.json`);
    let tokenListJSON = await response.json();
    console.log("listing available tokens: ", tokenListJSON);
    tokens = tokenListJSON.tokens;
    console.log("tokens: ", tokens);

    // Create token list for modal
    const parent = document.createElement('ul');
    parent.id = "token_list";
    
    for (const i in tokens){
        // Token row in the modal token list
        const li = document.createElement("li");
        li.className = "token_row";
        const html = `
        <img class="token_img" src="${tokens[i].logoURI}">
          <span class="token_list_text">${tokens[i].symbol}</span>
          `;
        li.innerHTML = html;
        li.onclick = () => {
            selectToken(tokens[i]);
        };
        parent.appendChild(li);
    };
    document.getElementById("token_list").replaceWith(parent);
}

function resetFields() { // oh god, with react state it would be much easier haha :)
    document.getElementById("from_placeholder").style.display = "inline-block";
    document.getElementById("to_placeholder").style.display = "inline-block";
    document.getElementById("from_token_img").removeAttribute("src");
    document.getElementById("from_token_img").classList.remove("token_img");
    document.getElementById("to_token_img").removeAttribute("src");
    document.getElementById("to_token_img").classList.remove("token_img");
    document.getElementById("from_token_text").innerHTML = null;
    document.getElementById("to_token_text").innerHTML = null;
    document.getElementById("from_amount").value = null;
    document.getElementById("to_amount").value = null;
    document.getElementById("gas_estimate").innerHTML = 0;

    currentTrade.from ? delete currentTrade.from: null
    currentTrade.to ? delete currentTrade.to: null

    const parentSourcesList = document.createElement('ul');
    parentSourcesList.id = "sourcesList";
    document.getElementById("sourcesList").replaceWith(parentSourcesList);
}

async function handleChainChainge() {
    resetFields();
    const chain = document.getElementById("chain_select").value;
    networks[chain] ? document.getElementById("max_button").disabled = true : document.getElementById("max_button").disabled = false;
    await listAvailableTokens();
}

async function selectToken(token){
    currentTrade[currentSelectSide] = token;
    console.log("currentTrade: ", currentTrade);
    renderInterface();
    if (currentSelectSide == 'from') {
        const chain = document.getElementById("chain_select").value;
        networks[chain] ? null : setMaximum();
    }
    closeModal();
}

async function setMaximum() {
    const chain = document.getElementById("chain_select").value;
    if (networks[chain]) {
        alert("Setting max value is now not supported for any chain except Ethereum Mainnet");
        return
    }
    const web3 = new Web3(Web3.givenProvider);
    if (currentTrade.from) {
        if (typeof window.ethereum !== "undefined") {
            const accounts = await ethereum.request({ method: "eth_accounts" });
            if (accounts.length) {
                const userAddress = accounts[0];
                const ERC20TokenContract = new web3.eth.Contract(erc20abi, currentTrade.from.address);
                console.log("setup ERC20TokenContract: ", ERC20TokenContract);
                const tokenBalanceTx = await ERC20TokenContract.methods.balanceOf(userAddress)
                const tokenBalance = await tokenBalanceTx.call();
                console.log("tokenBalance: ", tokenBalance);
                document.getElementById("from_amount").value = tokenBalance / (10 ** currentTrade.from.decimals)
            } else {
                alert("Please log in")
                return
            }
        } else {
            alert("Please enable MetaMask")
            return
        }
            
    } else {
        return
    }
}

function renderInterface(){
    if (currentTrade.from){
        console.log(currentTrade.from)
        document.getElementById("from_token_img").src = currentTrade.from.logoURI;
        document.getElementById("from_token_img").classList.add("token_img");
        document.getElementById("from_token_text").innerHTML = currentTrade.from.symbol;
        document.getElementById("from_placeholder").style.display = "none";
    }
    if (currentTrade.to){
        console.log(currentTrade.to)
        document.getElementById("to_token_img").src = currentTrade.to.logoURI;
        document.getElementById("to_token_img").classList.add("token_img");
        document.getElementById("to_token_text").innerHTML = currentTrade.to.symbol;
        document.getElementById("to_placeholder").style.display = "none";
    }
}

function openModal(side){
    currentSelectSide = side;
    document.getElementById("token_modal").style.display = "block";
}

async function closeModal(){
    document.getElementById("token_modal").style.display = "none";
    await getSwap();
}

async function getSwap(account = null){
    const accountCheck = (account) => {
        return (account && typeof account == 'string');
    }

    const chain = document.getElementById("chain_select").value;
    
    const apiEndpoint = accountCheck(account) ? 'quote' : 'price';
    console.log(`Getting ${apiEndpoint}`);
  
    if (!currentTrade.from || !currentTrade.to || !document.getElementById("from_amount").value) return;
    let amount = Number(document.getElementById("from_amount").value * 10 ** currentTrade.from.decimals);
  
    const params = Object.assign({
        sellToken: currentTrade.from.address,
        buyToken: currentTrade.to.address,
        sellAmount: amount,
    }, accountCheck(account) ? { takerAddress: account } : null)

    const response = await fetch(`https://${chain}api.0x.org/swap/v1/${apiEndpoint}?${qs.stringify(params)}`);
    
    const swapJSON = await response.json();
    console.log(`${apiEndpoint}: `, swapJSON);

    const parentSourcesList = document.createElement('ul'); // challenge 1;
    parentSourcesList.id = "sourcesList";
    
    if (!swapJSON.validationErrors) {
        document.getElementById("to_amount").value = swapJSON.buyAmount / (10 ** currentTrade.to.decimals);

        const ethPriceResponse = await fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=ethereum'); // challenge 4
        const ethPrice = await ethPriceResponse.json();
        document.getElementById("gas_estimate").innerHTML = `$${((Number(swapJSON.gasPrice) / 1e18) * ethPrice[0].current_price).toFixed(10)}`;

        swapJSON.sources ? swapJSON.sources
            .filter(it => it.proportion !== '0')
            .sort((a, b) => {
                const numA = Number(a.proportion);
                const numB = Number(b.proportion);

                if (numA > numB) {
                    return -1;
                }

                if (numA < numB) {
                    return 1;
                }

                return 0
            })
            .forEach(source => {
                const childSource = document.createElement("li");
                childSource.innerHTML = `${source.name}: ${Number(source.proportion) * 100} %`;
                parentSourcesList.appendChild(childSource);
            }) : null;
    } else {
        document.getElementById("to_amount").value = 0;
        document.getElementById("gas_estimate").innerHTML = 0;
        alert(`${swapJSON.validationErrors[0]?.reason}`)
    }

    document.getElementById("sourcesList").replaceWith(parentSourcesList);

    return swapJSON;
}

async function getQuote(account){ // refactor
    return await getSwap(account);
}



async function trySwap(){
    console.log("trying swap");
  
    const web3 = new Web3(Web3.givenProvider);
  
    // The address, if any, of the most recently used account that the caller is permitted to access
    let accounts = await ethereum.request({ method: "eth_accounts" });
    let takerAddress = accounts[0];
    console.log("takerAddress: ", takerAddress);
  
    const swapQuoteJSON = await getQuote(takerAddress);
  
    // Set Token Allowance
    // Set up approval amount
    const fromTokenAddress = currentTrade.from.address;
    const maxApproval = new BigNumber(2).pow(256).minus(1);
    console.log("approval amount: ", maxApproval);
    const ERC20TokenContract = new web3.eth.Contract(erc20abi, fromTokenAddress);
    console.log("setup ERC20TokenContract: ", ERC20TokenContract);
  
    // Grant the allowance target an allowance to spend our tokens.
    const tx = await ERC20TokenContract.methods.approve(
        swapQuoteJSON.allowanceTarget,
        maxApproval,
    )
    console.log(tx)
    await tx.send({ from: takerAddress })
    console.log(tx)

    // Perform the swap
    const receipt = await web3.eth.sendTransaction(swapQuoteJSON);
    console.log("receipt: ", receipt);
}

function filterNames(e) { // challenge 5
    console.log("triggered");
    const filter = e.target.value.toUpperCase();
    const lis = document.getElementById("token_list").getElementsByTagName('li');
    for (const li of lis) {
        const name = li.getElementsByClassName("token_list_text")[0].innerHTML;
        if (name.toUpperCase().indexOf(filter) == -1) {
            li.style.display = 'none';
        } else {
            li.style.display = 'list-item';
        }
    }
  }

init();

document.getElementById("login_button").onclick = connect;
document.getElementById("from_token_select").onclick = () => {
    openModal("from");
};
document.getElementById("to_token_select").onclick = () => {
    openModal("to");
};
document.getElementById("max_button").onclick = setMaximum; // challenge 2, did only for mainnet because of web3.js limitations (there is a room for improvement anyway)
document.getElementById("modal_close").onclick = closeModal;
document.getElementById("from_amount").onblur = getSwap;
document.getElementById("to_amount").onblur = getSwap; // challenge 3

document.getElementById("swap_button").onclick = trySwap;
document.getElementById('filterInput').addEventListener('keyup', filterNames);
document.getElementById("chain_select").onchange = handleChainChainge;