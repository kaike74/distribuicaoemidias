// VARIÁVEIS GLOBAIS
let isEditMode = false;
let campaignData = {};
let originalDistribution = {};
let currentDistribution = {};
let validDays = [];
let totalSpots = 0;
let notionId = null;
let isDragging = false;
let dragStartCell = null;

// INICIALIZAÇÃO
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Iniciando sistema...');
    try {
        await loadCampaignData();
        renderInterface();
        console.log('✅ Sistema carregado com sucesso!');
    } catch (error) {
        console.error('❌ Erro ao carregar:', error);
        showError(error.message);
    }
});

// DETECTAR AMBIENTE (NETLIFY OU CLOUDFLARE)
function getApiUrl() {
    const hostname = window.location.hostname;
    
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return '/.netlify/functions/notion';
    }
    if (hostname.includes('netlify.app')) {
        return '/.netlify/functions/notion';
    }
    if (hostname.includes('pages.dev')) {
        return '/notion';
    }
    return '/notion';
}

// 🆕 SISTEMA DE COMPACTAÇÃO DA DISTRIBUIÇÃO
function compressDistribution(distribution) {
    if (!distribution || typeof distribution !== 'object') {
        return '';
    }

    const parts = [];
    
    Object.entries(distribution).forEach(([dateKey, dayData]) => {
        if (!dayData || !dayData.products) return;
        
        // Converter data YYYY-MM-DD para YYYYMMDD (mais compacto)
        const shortDate = dateKey.replace(/-/g, '');
        
        // Montar produtos de forma compacta
        const productParts = [];
        Object.entries(dayData.products).forEach(([productType, count]) => {
            if (count > 0) {
                // Usar abreviações: spots30->s30, spots5->s5, etc.
                const shortType = productType
                    .replace('spots30', 's30')
                    .replace('spots5', 's5')
                    .replace('spots15', 's15')
                    .replace('spots60', 's60')
                    .replace('test60', 't60');
                
                productParts.push(`${shortType}=${count}`);
            }
        });
        
        if (productParts.length > 0) {
            // Formato: YYYYMMDD:total:produto1=valor1,produto2=valor2
            parts.push(`${shortDate}:${dayData.total}:${productParts.join(',')}`);
        }
    });
    
    const compressed = parts.join('|');
    console.log(`📦 Compactação: ${JSON.stringify(distribution).length} → ${compressed.length} chars`);
    
    return compressed;
}

function decompressDistribution(compressedData) {
    if (!compressedData || typeof compressedData !== 'string') {
        console.log('📦 Dados de distribuição vazios ou inválidos');
        return {};
    }

    console.log(`📦 Descompactando: ${compressedData.length} chars`);
    
    const distribution = {};
    
    try {
        const parts = compressedData.split('|');
        
        parts.forEach(part => {
            if (!part.trim()) return;
            
            const [shortDate, total, productsStr] = part.split(':');
            
            // Converter YYYYMMDD de volta para YYYY-MM-DD
            const year = shortDate.substring(0, 4);
            const month = shortDate.substring(4, 6);
            const day = shortDate.substring(6, 8);
            const dateKey = `${year}-${month}-${day}`;
            
            const dayData = {
                total: parseInt(total) || 0,
                products: {}
            };
            
            if (productsStr) {
                const productPairs = productsStr.split(',');
                productPairs.forEach(pair => {
                    const [shortType, count] = pair.split('=');
                    if (shortType && count) {
                        // Converter abreviações de volta
                        const fullType = shortType
                            .replace('s30', 'spots30')
                            .replace('s5', 'spots5')
                            .replace('s15', 'spots15')
                            .replace('s60', 'spots60')
                            .replace('t60', 'test60');
                        
                        dayData.products[fullType] = parseInt(count) || 0;
                    }
                });
            }
            
            distribution[dateKey] = dayData;
        });
        
        console.log('📦 Descompactação concluída:', Object.keys(distribution).length, 'dias');
        
    } catch (error) {
        console.error('❌ Erro na descompactação:', error);
        return {};
    }
    
    return distribution;
}

// CARREGAR DADOS
async function loadCampaignData() {
    const params = new URLSearchParams(window.location.search);
    notionId = params.get('id');
    
    if (notionId && /^[0-9a-f]{32}$/i.test(notionId)) {
        console.log('📡 Carregando da proposta:', notionId);
        campaignData = await fetchNotionData(notionId);
        campaignData.source = 'notion';
    } else if (params.toString()) {
        console.log('📋 Carregando dos parâmetros URL');
        campaignData = {
            spots30: parseInt(params.get('spots30')) || 0,
            spots5: parseInt(params.get('spots5')) || 0,
            spots15: parseInt(params.get('spots15')) || 0,
            spots60: parseInt(params.get('spots60')) || 0,
            test60: parseInt(params.get('test60')) || 0,
            emissora: params.get('emissora') || 'Emissora',
            inicio: params.get('inicio') || '01/01/2025',
            fim: params.get('fim') || '31/01/2025',
            dias: params.get('dias') || 'Seg.,Ter.,Qua.,Qui.,Sex.',
            pmm: parseInt(params.get('pmm')) || 1000,
            source: 'url'
        };
    } else {
        console.log('🎭 Carregando exemplo');
        campaignData = {
            spots30: 15, spots5: 8, spots15: 12, spots60: 5, test60: 3,
            emissora: 'EXEMPLO RADIO', inicio: '01/11/2025', fim: '30/11/2025',
            dias: 'Seg.,Qua.,Sex.', pmm: 1000, source: 'example'
        };
    }
    
    console.log('📊 Dados carregados:', campaignData);
}

// BUSCAR DADOS DA PROPOSTA
async function fetchNotionData(uuid) {
    const apiUrl = getApiUrl();
    console.log('🌐 Usando API:', apiUrl);
    
    const response = await fetch(`${apiUrl}?id=${uuid}`);
    if (!response.ok) {
        throw new Error(`Erro ao carregar dados da proposta: ${response.status}`);
    }
    
    const data = await response.json();
    
    // 🆕 DESCOMPACTAR DISTRIBUIÇÃO CUSTOMIZADA SE EXISTIR
    if (data.customDistribution && typeof data.customDistribution === 'string') {
        // Tentar descompactar primeiro (novo formato)
        let distributionData = decompressDistribution(data.customDistribution);
        
        // Se falhou, tentar como JSON (formato antigo)
        if (Object.keys(distributionData).length === 0) {
            try {
                distributionData = JSON.parse(data.customDistribution);
                console.log('📦 Usando formato JSON legado');
            } catch (e) {
                console.warn('⚠️ Não foi possível interpretar distribuição customizada');
                distributionData = {};
            }
        }
        
        data.customDistributionData = distributionData;
    }
    
    return data;
}

// 🆕 SALVAR DADOS NA PROPOSTA (AGORA COM COMPACTAÇÃO)
async function saveToNotion(dataToSave) {
    if (!notionId || campaignData.source !== 'notion') {
        console.log('⚠️ Não é possível salvar: não conectado à proposta');
        return false;
    }

    try {
        const apiUrl = getApiUrl();
        console.log('💾 Preparando dados para salvar na proposta...');
        console.log('Dados originais:', dataToSave);

        // 🆕 CALCULAR NOVAS QUANTIDADES BASEADAS NA DISTRIBUIÇÃO ATUAL
        if (dataToSave.updateProductQuantities) {
            const newQuantities = calculateProductQuantitiesFromDistribution();
            
            // 🆕 GARANTIR QUE SÃO NÚMEROS VÁLIDOS E REMOVER CAMPOS INVÁLIDOS
            Object.keys(newQuantities).forEach(key => {
                const value = newQuantities[key];
                if (typeof value !== 'number' || isNaN(value) || value < 0) {
                    console.warn(`⚠️ Valor inválido para ${key}:`, value, 'convertendo para 0');
                    newQuantities[key] = 0;
                } else {
                    // Garantir que é um número inteiro
                    newQuantities[key] = Math.floor(value);
                }
            });
            
            console.log('📊 Quantidades validadas:', newQuantities);
            Object.assign(dataToSave, newQuantities);
            delete dataToSave.updateProductQuantities;
        }

        // 🆕 COMPACTAR DISTRIBUIÇÃO CUSTOMIZADA
        if (dataToSave.customDistribution && typeof dataToSave.customDistribution === 'string') {
            // Se é JSON, tentar descompactar e compactar
            if (dataToSave.customDistribution.startsWith('{')) {
                try {
                    const distributionObj = JSON.parse(dataToSave.customDistribution);
                    dataToSave.customDistribution = compressDistribution(distributionObj);
                    console.log('📦 Distribuição compactada automaticamente');
                } catch (e) {
                    console.error('❌ Erro ao compactar JSON:', e);
                }
            }
        }

        // 🆕 VALIDAR E LIMPAR DADOS ANTES DE ENVIAR
        const cleanedData = {};
        Object.entries(dataToSave).forEach(([key, value]) => {
            // Pular valores undefined, null ou strings vazias
            if (value === undefined || value === null) {
                console.log(`🔧 Removendo campo ${key}: valor é ${value}`);
                return;
            }
            
            // Validar tipos específicos
            if (key.startsWith('spots') || key.startsWith('test')) {
                // Campos de quantidade devem ser números
                const numValue = parseInt(value);
                if (isNaN(numValue) || numValue < 0) {
                    console.warn(`⚠️ Valor inválido para ${key}:`, value, 'convertendo para 0');
                    cleanedData[key] = 0;
                } else {
                    cleanedData[key] = numValue;
                }
            } else if (key === 'customDistribution') {
                // Validar tamanho da distribuição compactada
                if (typeof value === 'string') {
                    if (value.trim() === '') {
                        cleanedData[key] = ''; // Permitir string vazia para limpar
                    } else if (value.length > 1900) { // Margem de segurança
                        console.error(`❌ Distribuição muito grande: ${value.length} chars`);
                        throw new Error('Distribuição muito complexa para salvar. Tente reduzir o período ou produtos.');
                    } else {
                        cleanedData[key] = value;
                        console.log(`✅ Distribuição compactada: ${value.length} chars`);
                    }
                }
            } else {
                // Outros campos
                cleanedData[key] = value;
            }
        });

        console.log('📤 Dados limpos e validados para envio:', cleanedData);
        console.log('📋 Tipos dos dados:', Object.fromEntries(
            Object.entries(cleanedData).map(([k, v]) => [k, typeof v])
        ));

        const response = await fetch(`${apiUrl}?id=${notionId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(cleanedData)
        });

        console.log('📡 Resposta do servidor:', response.status);

        if (!response.ok) {
            let errorDetails = `Status: ${response.status}`;
            let fullErrorData = null;
            
            try {
                const errorData = await response.json();
                fullErrorData = errorData;
                console.error('❌ Erro completo do servidor:', errorData);
                
                // Tentar extrair informação mais útil do erro
                if (errorData.details) {
                    try {
                        const parsedDetails = JSON.parse(errorData.details);
                        console.error('❌ Detalhes parseados:', parsedDetails);
                        errorDetails = parsedDetails.message || parsedDetails.code || errorDetails;
                    } catch (e) {
                        errorDetails = errorData.details;
                    }
                } else {
                    errorDetails = errorData.error || errorData.message || errorDetails;
                }
            } catch (e) {
                console.error('❌ Não foi possível ler erro JSON:', e);
                try {
                    errorDetails = await response.text();
                } catch (e2) {
                    console.error('❌ Não foi possível ler erro como texto:', e2);
                }
            }
            
            console.error('❌ Dados que causaram erro:', cleanedData);
            throw new Error(`Erro ao salvar na proposta: ${errorDetails}`);
        }

        const result = await response.json();
        console.log('✅ Salvo com sucesso na proposta');
        return true;
        
    } catch (error) {
        console.error('❌ Erro ao salvar na proposta:', error);
        console.error('❌ Stack completo:', error.stack);
        console.error('❌ Dados que causaram o erro:', dataToSave);
        throw error;
    }
}

// 🆕 CALCULAR QUANTIDADES DOS PRODUTOS BASEADO NA DISTRIBUIÇÃO ATUAL
function calculateProductQuantitiesFromDistribution() {
    const quantities = {
        spots30: 0,
        spots5: 0,
        spots15: 0,
        spots60: 0,
        test60: 0
    };

    console.log('🔍 Calculando quantidades da distribuição atual...');
    console.log('Distribuição atual:', currentDistribution);

    // Verificar se currentDistribution existe e tem dados
    if (!currentDistribution || typeof currentDistribution !== 'object') {
        console.warn('⚠️ Distribuição atual inválida:', currentDistribution);
        return quantities;
    }

    // Somar todas as inserções por produto na distribuição atual
    Object.entries(currentDistribution).forEach(([dateKey, dayData]) => {
        if (!dayData || !dayData.products) {
            console.log(`⚠️ Dados inválidos para ${dateKey}:`, dayData);
            return;
        }

        Object.entries(dayData.products).forEach(([productType, count]) => {
            if (quantities.hasOwnProperty(productType)) {
                const validCount = parseInt(count) || 0;
                if (validCount < 0) {
                    console.warn(`⚠️ Valor negativo encontrado para ${productType} em ${dateKey}:`, count);
                    return;
                }
                quantities[productType] += validCount;
                console.log(`➕ ${productType} em ${dateKey}: +${validCount} (total: ${quantities[productType]})`);
            } else {
                console.warn(`⚠️ Produto desconhecido ignorado: ${productType}`);
            }
        });
    });

    // Validar resultado final
    Object.keys(quantities).forEach(key => {
        if (typeof quantities[key] !== 'number' || isNaN(quantities[key]) || quantities[key] < 0) {
            console.error(`❌ Quantidade inválida calculada para ${key}:`, quantities[key]);
            quantities[key] = 0;
        }
    });

    console.log('📊 Quantidades finais calculadas:', quantities);
    return quantities;
}

// RENDERIZAR INTERFACE
function renderInterface() {
    const startDate = parseDate(campaignData.inicio);
    const endDate = parseDate(campaignData.fim);
    const selectedWeekdays = parseWeekdays(campaignData.dias);
    const activeProducts = getActiveProducts(); // Manter para cálculos internos
    
    totalSpots = Object.values(activeProducts).reduce((sum, count) => sum + count, 0);
    validDays = getValidDays(startDate, endDate, selectedWeekdays);
    
    // Validações
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        throw new Error('Datas inválidas');
    }
    if (validDays.length === 0) {
        throw new Error('Nenhum dia válido encontrado');
    }
    
    // VERIFICAR SE HÁ DISTRIBUIÇÃO CUSTOMIZADA
    if (campaignData.customDistributionData) {
        console.log('📊 Usando distribuição customizada');
        currentDistribution = campaignData.customDistributionData;
    } else {
        console.log('🔄 Calculando distribuição automática');
        currentDistribution = calculateDistribution(activeProducts, validDays);
    }
    
    originalDistribution = JSON.parse(JSON.stringify(currentDistribution));
    
    // Renderizar elementos - usar produtos visíveis para interface
    updateHeader();
    updateProducts(activeProducts); // Função já usa getVisibleProducts() internamente
    updateStats(startDate, endDate);
    updateActions();
    renderCalendar(startDate, endDate, selectedWeekdays);
    
    // Mostrar interface
    document.getElementById('stats').style.display = 'grid';
    document.getElementById('actions-normal').style.display = 'flex';
}

// UTILITÁRIOS DE DATA
function parseDate(dateStr) {
    console.log('🔍 Parseando data:', dateStr);
    
    // Se já é uma string no formato ISO (YYYY-MM-DD), converter direto
    if (dateStr.includes('-') && dateStr.length === 10) {
        const [year, month, day] = dateStr.split('-');
        const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        console.log('📅 Data ISO convertida:', date.toLocaleDateString('pt-BR'));
        return date;
    }
    
    // Formato brasileiro DD/MM/YYYY
    const [day, month, year] = dateStr.split('/');
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    console.log('📅 Data BR convertida:', date.toLocaleDateString('pt-BR'));
    return date;
}

function formatDate(date) {
    return date.toLocaleDateString('pt-BR');
}

function parseWeekdays(diasStr) {
    const mapping = {
        'Dom.': 0, 'Seg.': 1, 'Ter.': 2, 'Qua.': 3,
        'Qui.': 4, 'Sex.': 5, 'Sáb.': 6
    };
    return diasStr.split(',').map(day => mapping[day.trim()]).filter(d => d !== undefined);
}

function getValidDays(startDate, endDate, selectedWeekdays) {
    const days = [];
    const current = new Date(startDate);
    
    while (current <= endDate) {
        if (selectedWeekdays.includes(current.getDay())) {
            days.push(new Date(current));
        }
        current.setDate(current.getDate() + 1);
    }
    return days;
}

// PRODUTOS E CÁLCULOS
function getActiveProducts() {
    return {
        spots30: campaignData.spots30 || 0,
        spots5: campaignData.spots5 || 0,
        spots15: campaignData.spots15 || 0,
        spots60: campaignData.spots60 || 0,
        test60: campaignData.test60 || 0
    };
}

// 🆕 OBTER PRODUTOS VISÍVEIS (NÃO OCULTOS)
function getVisibleProducts() {
    const allProducts = getActiveProducts();
    const visibleProducts = {};
    
    // Só incluir produtos que:
    // 1. Têm valor > 0 na campanha original (não estão "ocultos")
    // OU
    // 2. Estão sendo usados na distribuição atual (foram editados pelo usuário)
    Object.entries(allProducts).forEach(([productType, originalCount]) => {
        const isOriginallyActive = originalCount > 0;
        
        // Verificar se está sendo usado na distribuição atual
        const currentUsage = Object.values(currentDistribution).reduce((sum, dayData) => {
            return sum + (dayData.products?.[productType] || 0);
        }, 0);
        const isCurrentlyUsed = currentUsage > 0;
        
        // Mostrar se é originalmente ativo OU está sendo usado atualmente
        if (isOriginallyActive || isCurrentlyUsed) {
            visibleProducts[productType] = originalCount;
        }
    });
    
    console.log('👁️ Produtos visíveis:', visibleProducts);
    return visibleProducts;
}

function getProductName(type) {
    const names = {
        spots30: 'Spots 30"', spots5: 'Spots 5"', spots15: 'Spots 15"',
        spots60: 'Spots 60"', test60: 'Test. 60"'
    };
    return names[type] || type;
}

function calculateImpact(products) {
    const pmm = campaignData.pmm || 1000;
    let impact = 0;
    impact += (products.spots30 || 0) * pmm;
    impact += (products.test60 || 0) * (pmm * 2);
    impact += (products.spots60 || 0) * (pmm * 2);
    impact += (products.spots15 || 0) * (pmm / 2);
    impact += (products.spots5 || 0) * (pmm / 6);
    return Math.round(impact);
}

// DISTRIBUIÇÃO
function calculateDistribution(products, validDays) {
    const totalSpots = Object.values(products).reduce((sum, spots) => sum + spots, 0);
    
    if (totalSpots === 0 || validDays.length === 0) {
        return {};
    }
    
    const distribution = {};
    
    // Inicializar todos os dias
    validDays.forEach(day => {
        const dateKey = day.toISOString().split('T')[0];
        distribution[dateKey] = { total: 0, products: {} };
    });
    
    // Distribuir cada produto
    Object.entries(products).forEach(([productType, totalSpotsForProduct]) => {
        if (totalSpotsForProduct <= 0) return;
        
        const daysForThisProduct = Math.min(totalSpotsForProduct, validDays.length);
        const spotsPerDay = Math.floor(totalSpotsForProduct / daysForThisProduct);
        let remainingSpots = totalSpotsForProduct % daysForThisProduct;
        
        for (let i = 0; i < daysForThisProduct; i++) {
            const dayIndex = Math.floor((i * validDays.length) / daysForThisProduct);
            const dateKey = validDays[dayIndex].toISOString().split('T')[0];
            
            const spotsForThisDay = spotsPerDay + (remainingSpots > 0 ? 1 : 0);
            if (remainingSpots > 0) remainingSpots--;
            
            distribution[dateKey].products[productType] = 
                (distribution[dateKey].products[productType] || 0) + spotsForThisDay;
            distribution[dateKey].total += spotsForThisDay;
        }
    });
    
    return distribution;
}

// ATUALIZAR ELEMENTOS
function updateHeader() {
    const titleSuffix = campaignData.source === 'example' ? ' (EXEMPLO)' : '';
    document.getElementById('title').textContent = campaignData.emissora.toUpperCase() + titleSuffix;
}

function updateProducts(activeProducts) {
    const container = document.getElementById('products-list');
    container.innerHTML = '';
    
    // 🆕 MOSTRAR APENAS PRODUTOS VISÍVEIS (NÃO OCULTOS)
    const visibleProducts = getVisibleProducts();
    
    Object.entries(visibleProducts).forEach(([type, originalCount]) => {
        // Calcular total atual da distribuição para este produto
        const currentCount = Object.values(currentDistribution).reduce((sum, dayData) => {
            return sum + (dayData.products?.[type] || 0);
        }, 0);
        
        const tag = document.createElement('span');
        tag.className = `product-tag tag-${type}`;
        // Mostrar a quantidade atual da distribuição, não a original
        tag.textContent = `${getProductName(type)}: ${currentCount}`;
        container.appendChild(tag);
    });
    
    document.getElementById('products-section').style.display = 'block';
}

function updateStats(startDate, endDate) {
    // 🆕 CALCULAR TOTAIS BASEADOS NA DISTRIBUIÇÃO ATUAL
    const currentTotalSpots = Object.values(currentDistribution).reduce((sum, day) => sum + (day.total || 0), 0);
    const activeProducts = getActiveProducts();
    
    const periodRange = `${startDate.getDate().toString().padStart(2, '0')}/${(startDate.getMonth() + 1).toString().padStart(2, '0')}-${endDate.getDate().toString().padStart(2, '0')}/${(endDate.getMonth() + 1).toString().padStart(2, '0')}`;
    const avgSpots = validDays.length > 0 ? (currentTotalSpots / validDays.length).toFixed(1) : '0';
    
    // 🆕 CALCULAR IMPACTO BASEADO NA DISTRIBUIÇÃO ATUAL
    const currentProductTotals = calculateProductQuantitiesFromDistribution();
    const totalImpact = calculateImpact(currentProductTotals);
    
    document.getElementById('stat-period').textContent = periodRange;
    document.getElementById('stat-spots').textContent = currentTotalSpots;
    document.getElementById('stat-impact').textContent = totalImpact.toLocaleString();
    document.getElementById('stat-avg').textContent = avgSpots;
}

function updateActions() {
    document.getElementById('campaign-name').textContent = campaignData.emissora;
}

// CALENDÁRIO HORIZONTAL
function renderCalendar(startDate, endDate, selectedWeekdays) {
    const container = document.getElementById('calendar');
    container.innerHTML = '';
    
    console.log('📅 Renderizando calendário:', {
        inicio: startDate.toLocaleDateString('pt-BR'),
        fim: endDate.toLocaleDateString('pt-BR'),
        dias: selectedWeekdays
    });
    
    // 🆕 GERAR APENAS OS MESES QUE ESTÃO NO PERÍODO
    const months = new Set();
    const current = new Date(startDate);
    
    // Ir mês por mês apenas no período definido
    while (current <= endDate) {
        months.add(`${current.getFullYear()}-${current.getMonth()}`);
        
        // Avançar para o próximo mês
        current.setMonth(current.getMonth() + 1);
        current.setDate(1); // Sempre dia 1 do mês
    }
    
    console.log('📊 Meses a renderizar:', Array.from(months));
    
    months.forEach(monthKey => {
        const [year, month] = monthKey.split('-').map(Number);
        const monthElement = createHorizontalMonthCalendar(year, month, selectedWeekdays);
        
        // Só adicionar se o mês tem dias válidos
        const monthDays = getValidDaysForMonth(year, month, selectedWeekdays);
        if (monthDays.length > 0) {
            container.appendChild(monthElement);
        } else {
            console.log(`⚠️ Mês ${year}-${month} não tem dias válidos, pulando...`);
        }
    });
}

function createHorizontalMonthCalendar(year, month, selectedWeekdays) {
    const monthContainer = document.createElement('div');
    monthContainer.className = 'calendar-month-horizontal';
    
    // Cabeçalho do mês
    const header = document.createElement('div');
    header.className = 'month-header';
    header.textContent = getMonthName(month, year);
    monthContainer.appendChild(header);
    
    // Obter dias válidos do mês
    const monthDays = getValidDaysForMonth(year, month, selectedWeekdays);
    
    if (monthDays.length === 0) {
        return monthContainer;
    }
    
    // Container da tabela
    const tableContainer = document.createElement('div');
    tableContainer.className = 'table-container';
    
    // Criar tabela horizontal
    const table = document.createElement('table');
    table.className = 'horizontal-calendar-table';
    
    // Cabeçalho com os dias
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    
    // Primeira coluna vazia para os rótulos dos produtos
    const emptyHeader = document.createElement('th');
    emptyHeader.className = 'product-label-header';
    emptyHeader.textContent = 'PRODUTOS';
    headerRow.appendChild(emptyHeader);
    
    // Colunas dos dias
    monthDays.forEach(day => {
        const th = document.createElement('th');
        th.className = 'day-header';
        
        if (day.getDay() === 0 || day.getDay() === 6) {
            th.classList.add('weekend');
        }
        
        const dayName = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'][day.getDay()];
        const dayNumber = day.getDate().toString().padStart(2, '0');
        
        th.innerHTML = `
            <div class="day-name">${dayName}</div>
            <div class="day-number">${dayNumber}</div>
        `;
        headerRow.appendChild(th);
    });
    
    thead.appendChild(headerRow);
    table.appendChild(thead);
    
    // Corpo da tabela
    const tbody = document.createElement('tbody');
    
    // 🆕 MOSTRAR APENAS PRODUTOS VISÍVEIS (NÃO OCULTOS)
    const visibleProducts = getVisibleProducts();
    
    // Linhas de produtos - APENAS produtos visíveis
    Object.entries(visibleProducts).forEach(([productType, originalCount]) => {
        const row = createProductRow(productType, monthDays);
        tbody.appendChild(row);
    });
    
    // Linha de total
    const totalRow = createTotalRow(monthDays);
    tbody.appendChild(totalRow);
    
    table.appendChild(tbody);
    tableContainer.appendChild(table);
    monthContainer.appendChild(tableContainer);
    
    return monthContainer;
}

function getValidDaysForMonth(year, month, selectedWeekdays) {
    const days = [];
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    // 🆕 OBTER PERÍODO REAL DA CAMPANHA
    const startDate = parseDate(campaignData.inicio);
    const endDate = parseDate(campaignData.fim);
    
    const current = new Date(firstDay);
    while (current <= lastDay) {
        // ✅ VERIFICAR SE ESTÁ DENTRO DO PERÍODO DA CAMPANHA E É DIA VÁLIDO
        const isInPeriod = current >= startDate && current <= endDate;
        const isValidWeekday = selectedWeekdays.includes(current.getDay());
        
        if (isInPeriod && isValidWeekday) {
            days.push(new Date(current));
        }
        
        current.setDate(current.getDate() + 1);
    }
    
    return days;
}

function createProductRow(productType, monthDays) {
    const row = document.createElement('tr');
    row.className = 'product-row';
    row.dataset.productType = productType;
    
    // Primeira coluna com o nome do produto
    const labelCell = document.createElement('td');
    labelCell.className = `product-label product-${productType}`;
    labelCell.innerHTML = `
        <div class="product-icon">${getProductIcon(productType)}</div>
        <div class="product-name">${getProductName(productType).toUpperCase()}</div>
    `;
    row.appendChild(labelCell);
    
    // Células dos dias
    monthDays.forEach(day => {
        const dateKey = day.toISOString().split('T')[0];
        const dayData = currentDistribution[dateKey];
        const spotCount = dayData?.products[productType] || 0;
        
        const cell = document.createElement('td');
        cell.className = 'day-cell';
        cell.dataset.date = dateKey;
        cell.dataset.productType = productType;
        cell.dataset.spots = spotCount;
        
        // VERIFICAR SE É DIA VÁLIDO DA CAMPANHA
        const selectedWeekdays = parseWeekdays(campaignData.dias);
        const isValidDay = selectedWeekdays.includes(day.getDay());
        
        if (isValidDay && spotCount > 0) {
            cell.textContent = spotCount;
            cell.classList.add('has-spots');
        } else if (!isValidDay) {
            cell.classList.add('invalid-day');
        }
        
        // 🆕 ADICIONAR EVENTOS DE EDIÇÃO DIRETA
        if (isValidDay) {
            setupCellEditing(cell);
            setupDragAndDrop(cell);
        }
        
        // Adicionar tooltip se há dados
        if (isValidDay && dayData) {
            setupTooltip(cell, dayData);
        }
        
        row.appendChild(cell);
    });
    
    return row;
}

function createTotalRow(monthDays) {
    const row = document.createElement('tr');
    row.className = 'total-row';
    
    // Primeira coluna
    const labelCell = document.createElement('td');
    labelCell.className = 'total-label';
    labelCell.innerHTML = `
        <div class="total-icon">📊</div>
        <div class="total-name">TOTAL POR DIA</div>
    `;
    row.appendChild(labelCell);
    
    // Células dos dias
    monthDays.forEach(day => {
        const dateKey = day.toISOString().split('T')[0];
        const dayData = currentDistribution[dateKey];
        const totalSpots = dayData?.total || 0;
        
        const cell = document.createElement('td');
        cell.className = 'total-cell';
        cell.dataset.date = dateKey;
        
        // VERIFICAR SE É DIA VÁLIDO DA CAMPANHA
        const selectedWeekdays = parseWeekdays(campaignData.dias);
        const isValidDay = selectedWeekdays.includes(day.getDay());
        
        if (isValidDay && totalSpots > 0) {
            cell.textContent = totalSpots;
            cell.classList.add('has-total');
        } else if (!isValidDay) {
            cell.classList.add('invalid-day');
        }
        
        row.appendChild(cell);
    });
    
    return row;
}

// 🆕 CONFIGURAR EDIÇÃO DIRETA DA CÉLULA (TIPO EXCEL)
function setupCellEditing(cell) {
    // Não adicionar eventos de clique - apenas permitir edição direta
}

// 🆕 MOSTRAR STATUS ATUAL (SEM OBRIGAR VALIDAÇÃO)
function showCurrentStatus() {
    const totalUsed = Object.values(currentDistribution).reduce((sum, day) => sum + (day.total || 0), 0);
    const validation = document.getElementById('validation');
    
    if (validation) {
        validation.style.display = 'block';
        validation.className = 'validation success';
        validation.textContent = `📊 Total atual: ${totalUsed} inserções distribuídas`;
    }
}

// 🆕 CONFIGURAR DRAG & DROP MELHORADO
function setupDragAndDrop(cell) {
    cell.addEventListener('mousedown', handleDragStart);
    cell.addEventListener('mouseenter', handleDragEnter);
    cell.addEventListener('mouseup', handleDragEnd);
}

function handleDragStart(e) {
    if (!isEditMode) return;
    
    // Verificar se o clique foi na bolinha de drag (canto inferior direito)
    const rect = e.currentTarget.getBoundingClientRect();
    const isInDragHandle = (e.clientX > rect.right - 12 && e.clientY > rect.bottom - 12);
    
    if (!isInDragHandle) return; // Só inicia drag se clicar na bolinha
    
    isDragging = true;
    dragStartCell = e.currentTarget;
    dragStartCell.classList.add('drag-start');
    
    // Prevenir seleção de texto
    e.preventDefault();
    
    // Adicionar listeners globais
    document.addEventListener('mouseup', handleDragEnd);
    document.addEventListener('mousemove', handleDragMove);
}

function handleDragEnter(e) {
    if (!isDragging || !isEditMode) return;
    
    const cell = e.currentTarget;
    if (cell.classList.contains('invalid-day')) return;
    
    cell.classList.add('drag-hover');
}

function handleDragMove(e) {
    if (!isDragging) return;
    
    // Remover hover de todas as células
    document.querySelectorAll('.day-cell').forEach(cell => {
        cell.classList.remove('drag-hover');
    });
    
    // Adicionar hover na célula atual
    const elementUnderMouse = document.elementFromPoint(e.clientX, e.clientY);
    if (elementUnderMouse && elementUnderMouse.classList.contains('day-cell')) {
        if (!elementUnderMouse.classList.contains('invalid-day')) {
            elementUnderMouse.classList.add('drag-hover');
        }
    }
}

function handleDragEnd(e) {
    if (!isDragging) return;
    
    isDragging = false;
    
    // Remover listeners globais
    document.removeEventListener('mouseup', handleDragEnd);
    document.removeEventListener('mousemove', handleDragMove);
    
    // Encontrar célula final
    const elementUnderMouse = document.elementFromPoint(e.clientX, e.clientY);
    let dragEndCell = null;
    
    if (elementUnderMouse && elementUnderMouse.classList.contains('day-cell')) {
        dragEndCell = elementUnderMouse;
    }
    
    // Limpar classes visuais
    document.querySelectorAll('.day-cell').forEach(cell => {
        cell.classList.remove('drag-start', 'drag-hover');
    });
    
    // Executar preenchimento se válido
    if (dragStartCell && dragEndCell && dragStartCell !== dragEndCell) {
        fillCellRange(dragStartCell, dragEndCell);
    }
    
    dragStartCell = null;
}

// PREENCHER RANGE DE CÉLULAS
function fillCellRange(startCell, endCell) {
    const startValue = parseInt(startCell.textContent) || 0;
    const startProductType = startCell.dataset.productType;
    const endProductType = endCell.dataset.productType;
    
    // Só funciona na mesma linha de produto
    if (startProductType !== endProductType) return;
    
    // Encontrar todas as células da mesma linha entre start e end
    const allCells = Array.from(document.querySelectorAll(`[data-product-type="${startProductType}"]`));
    const startIndex = allCells.indexOf(startCell);
    const endIndex = allCells.indexOf(endCell);
    
    if (startIndex === -1 || endIndex === -1) return;
    
    const minIndex = Math.min(startIndex, endIndex);
    const maxIndex = Math.max(startIndex, endIndex);
    
    // Preencher células no range
    for (let i = minIndex; i <= maxIndex; i++) {
        const cell = allCells[i];
        if (cell.classList.contains('invalid-day')) continue;
        
        // Definir valor e simular blur para atualizar
        cell.textContent = startValue;
        
        // Disparar evento de blur para atualizar a distribuição
        const blurEvent = new Event('blur');
        cell.dispatchEvent(blurEvent);
    }
}

function getProductIcon(productType) {
    const icons = {
        spots30: '📺',
        spots5: '⚡',
        spots15: '🎬',
        spots60: '🎭',
        test60: '🎪'
    };
    return icons[productType] || '📻';
}

function getMonthName(month, year) {
    const months = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    return `${months[month]} ${year}`;
}

// TOOLTIP
function setupTooltip(cell, dayData) {
    cell.addEventListener('mouseenter', (e) => showTooltip(e, dayData));
    cell.addEventListener('mouseleave', hideTooltip);
    cell.addEventListener('mousemove', updateTooltipPosition);
}

function showTooltip(e, dayData) {
    let tooltip = document.querySelector('.tooltip');
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.className = 'tooltip';
        document.body.appendChild(tooltip);
    }
    
    const pmm = campaignData.pmm || 1000;
    const dayImpact = calculateImpact(dayData.products);
    
    let content = `
        <div class="tooltip-item">
            <i class="fas fa-tv tooltip-icon"></i>
            <span>Total de inserções: ${dayData.total}</span>
        </div>
        <div class="tooltip-item" style="margin-bottom: 15px;">
            <i class="fas fa-chart-bar tooltip-icon"></i>
            <span>Impactos: ${dayImpact.toLocaleString()}</span>
        </div>
        
        <div class="detail-heading">
            <i class="fas fa-clipboard-list tooltip-icon"></i>
            <span>Detalhamento:</span>
        </div>
        <ul class="detail-list">
    `;
    
    Object.entries(dayData.products).forEach(([type, count]) => {
        if (count > 0) {
            content += `<li>${getProductName(type)}: ${count}</li>`;
        }
    });
    
    content += `</ul>`;
    
    tooltip.innerHTML = content;
    tooltip.classList.add('show');
    
    updateTooltipPosition(e);
}

function hideTooltip() {
    const tooltip = document.querySelector('.tooltip');
    if (tooltip) {
        tooltip.classList.remove('show');
    }
}

function updateTooltipPosition(e) {
    const tooltip = document.querySelector('.tooltip');
    if (!tooltip || !tooltip.classList.contains('show')) return;
    
    const rect = e.target.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    
    let left = rect.left + rect.width / 2 - tooltipRect.width / 2;
    let top = rect.top - tooltipRect.height - 15;
    
    if (left < 10) left = 10;
    if (left + tooltipRect.width > window.innerWidth - 10) {
        left = window.innerWidth - tooltipRect.width - 10;
    }
    if (top < 10) top = rect.bottom + 15;
    
    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
}

// EDIÇÃO
function startEdit() {
    isEditMode = true;
    document.body.classList.add('edit-mode');
    document.getElementById('actions-normal').style.display = 'none';
    document.getElementById('actions-edit').style.display = 'flex';
    
    // Salvar estado original
    originalDistribution = JSON.parse(JSON.stringify(currentDistribution));
    
    // 🆕 TORNAR CÉLULAS EDITÁVEIS (TIPO EXCEL)
    makeTableEditable();
    
    // Mostrar status atual
    showCurrentStatus();
    
    console.log('✏️ Modo de edição ativado - Digite nas células para editar');
}

// 🆕 TORNAR TABELA EDITÁVEL TIPO EXCEL
function makeTableEditable() {
    const cells = document.querySelectorAll('.day-cell');
    
    cells.forEach(cell => {
        const dateKey = cell.dataset.date;
        const productType = cell.dataset.productType;
        
        // Verificar se é dia válido
        if (dateKey && productType && !cell.classList.contains('invalid-day')) {
            cell.classList.add('editable');
            cell.setAttribute('contenteditable', 'true');
            cell.setAttribute('inputmode', 'numeric');
            
            // Eventos de edição
            cell.addEventListener('blur', handleCellBlur);
            cell.addEventListener('keydown', handleCellKeydown);
            cell.addEventListener('input', handleCellInput);
            cell.addEventListener('focus', handleCellFocus);
        }
    });
}

// 🆕 REMOVER EDIÇÃO DA TABELA
function makeTableReadOnly() {
    const cells = document.querySelectorAll('.day-cell.editable');
    
    cells.forEach(cell => {
        cell.classList.remove('editable', 'modified');
        cell.removeAttribute('contenteditable');
        cell.removeAttribute('inputmode');
        
        // Remover eventos
        cell.removeEventListener('blur', handleCellBlur);
        cell.removeEventListener('keydown', handleCellKeydown);
        cell.removeEventListener('input', handleCellInput);
        cell.removeEventListener('focus', handleCellFocus);
    });
}

// 🆕 MANIPULAR FOCO NA CÉLULA
function handleCellFocus(e) {
    const cell = e.currentTarget;
    const currentValue = cell.textContent.trim();
    
    // Selecionar todo o texto
    if (currentValue && currentValue !== '') {
        const range = document.createRange();
        range.selectNodeContents(cell);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
    }
}

// 🆕 MANIPULAR ENTRADA DE DADOS
function handleCellInput(e) {
    const cell = e.currentTarget;
    let value = cell.textContent.replace(/[^0-9]/g, ''); // Apenas números
    
    // Limitar a 3 dígitos
    if (value.length > 3) {
        value = value.substring(0, 3);
    }
    
    cell.textContent = value;
    
    // Mover cursor para o final
    const range = document.createRange();
    const selection = window.getSelection();
    range.selectNodeContents(cell);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
}

// 🆕 MANIPULAR TECLAS
function handleCellKeydown(e) {
    const cell = e.currentTarget;
    
    // Enter ou Tab - confirmar e ir para próxima célula
    if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        cell.blur();
        
        if (e.key === 'Tab') {
            const nextCell = findNextEditableCell(cell, !e.shiftKey);
            if (nextCell) {
                nextCell.focus();
            }
        }
    }
    
    // Escape - cancelar edição
    if (e.key === 'Escape') {
        const dateKey = cell.dataset.date;
        const productType = cell.dataset.productType;
        const originalValue = originalDistribution[dateKey]?.products[productType] || 0;
        
        cell.textContent = originalValue > 0 ? originalValue : '';
        cell.blur();
    }
    
    // Permitir apenas números, backspace, delete, setas
    const allowedKeys = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
    if (!/^[0-9]$/.test(e.key) && !allowedKeys.includes(e.key)) {
        e.preventDefault();
    }
}

// 🆕 MANIPULAR SAÍDA DA CÉLULA
function handleCellBlur(e) {
    const cell = e.currentTarget;
    const dateKey = cell.dataset.date;
    const productType = cell.dataset.productType;
    const newValue = Math.max(0, parseInt(cell.textContent.trim()) || 0);
    
    // Atualizar distribuição
    if (!currentDistribution[dateKey]) {
        currentDistribution[dateKey] = { total: 0, products: {} };
    }
    
    const oldValue = currentDistribution[dateKey].products[productType] || 0;
    currentDistribution[dateKey].products[productType] = newValue;
    
    // Recalcular total do dia
    currentDistribution[dateKey].total = Object.values(currentDistribution[dateKey].products)
        .reduce((sum, count) => sum + (count || 0), 0);
    
    // Atualizar célula visualmente
    cell.dataset.spots = newValue;
    if (newValue > 0) {
        cell.textContent = newValue;
        cell.classList.add('has-spots');
    } else {
        cell.textContent = '';
        cell.classList.remove('has-spots');
    }
    
    // Marcar como modificada se mudou
    if (oldValue !== newValue) {
        cell.classList.add('modified');
        setTimeout(() => cell.classList.remove('modified'), 1000);
    }
    
    // Atualizar célula do total na mesma coluna
    updateTotalCell(dateKey);
    
    // 🆕 ATUALIZAR ESTATÍSTICAS E PRODUTOS EM TEMPO REAL
    updateLiveStats();
    updateLiveProducts();
    
    // Mostrar status atual
    showCurrentStatus();
}

// 🆕 ATUALIZAR ESTATÍSTICAS EM TEMPO REAL
function updateLiveStats() {
    const currentTotalSpots = Object.values(currentDistribution).reduce((sum, day) => sum + (day.total || 0), 0);
    const avgSpots = validDays.length > 0 ? (currentTotalSpots / validDays.length).toFixed(1) : '0';
    
    const currentProductTotals = calculateProductQuantitiesFromDistribution();
    const totalImpact = calculateImpact(currentProductTotals);
    
    document.getElementById('stat-spots').textContent = currentTotalSpots;
    document.getElementById('stat-impact').textContent = totalImpact.toLocaleString();
    document.getElementById('stat-avg').textContent = avgSpots;
}

// 🆕 ATUALIZAR PRODUTOS EM TEMPO REAL
function updateLiveProducts() {
    const container = document.getElementById('products-list');
    container.innerHTML = '';
    
    // 🆕 MOSTRAR APENAS PRODUTOS VISÍVEIS (NÃO OCULTOS)
    const visibleProducts = getVisibleProducts();
    
    Object.entries(visibleProducts).forEach(([type, originalCount]) => {
        const currentCount = Object.values(currentDistribution).reduce((sum, dayData) => {
            return sum + (dayData.products?.[type] || 0);
        }, 0);
        
        const tag = document.createElement('span');
        tag.className = `product-tag tag-${type}`;
        tag.textContent = `${getProductName(type)}: ${currentCount}`;
        container.appendChild(tag);
    });
}

// 🆕 ENCONTRAR PRÓXIMA CÉLULA EDITÁVEL
function findNextEditableCell(currentCell, forward = true) {
    const editableCells = Array.from(document.querySelectorAll('.day-cell.editable'));
    const currentIndex = editableCells.indexOf(currentCell);
    
    if (currentIndex === -1) return null;
    
    const nextIndex = forward ? currentIndex + 1 : currentIndex - 1;
    
    if (nextIndex >= 0 && nextIndex < editableCells.length) {
        return editableCells[nextIndex];
    }
    
    return null;
}

// ATUALIZAR CÉLULA DE TOTAL
function updateTotalCell(dateKey) {
    const totalCell = document.querySelector(`.total-cell[data-date="${dateKey}"]`);
    if (totalCell) {
        const newTotal = currentDistribution[dateKey]?.total || 0;
        totalCell.dataset.total = newTotal;
        if (newTotal > 0) {
            totalCell.textContent = newTotal;
            totalCell.classList.add('has-total');
        } else {
            totalCell.textContent = '';
            totalCell.classList.remove('has-total');
        }
    }
}

// 🆕 SALVAR EDIÇÃO (AGORA COM COMPACTAÇÃO AUTOMÁTICA)
async function saveEdit() {
    try {
        console.log('🚀 Iniciando processo de salvamento...');
        console.log('📊 Distribuição atual a ser salva:', currentDistribution);
        
        showLoadingMessage('💾 Salvando na proposta...');

        // 🆕 VALIDAR DISTRIBUIÇÃO ANTES DE SALVAR
        const isValidDistribution = validateDistribution(currentDistribution);
        if (!isValidDistribution) {
            throw new Error('Distribuição contém dados inválidos');
        }

        // 🆕 COMPACTAR DISTRIBUIÇÃO AUTOMATICAMENTE
        const compressedDistribution = compressDistribution(currentDistribution);
        
        if (compressedDistribution.length > 1900) {
            throw new Error('Distribuição muito complexa para salvar. Tente reduzir o período da campanha.');
        }

        // Preparar dados para salvar
        const dataToSave = {
            customDistribution: compressedDistribution,
            updateProductQuantities: true
        };

        console.log('📤 Dados preparados para envio:', dataToSave);

        // Salvar distribuição customizada + atualizar quantidades dos produtos
        await saveToNotion(dataToSave);

        // Atualizar dados locais
        originalDistribution = JSON.parse(JSON.stringify(currentDistribution));
        campaignData.customDistributionData = currentDistribution;
        
        // 🆕 ATUALIZAR QUANTIDADES LOCAIS TAMBÉM
        const newQuantities = calculateProductQuantitiesFromDistribution();
        console.log('🔄 Atualizando quantidades locais:', newQuantities);
        Object.assign(campaignData, newQuantities);
        
        exitEditMode();

        // Recarregar interface para refletir mudanças
        renderInterface();

        showSuccessMessage('✅ Proposta salva com sucesso!');

    } catch (error) {
        console.error('❌ Erro ao salvar:', error);
        console.error('❌ Distribuição que causou erro:', currentDistribution);
        
        // Tentar dar uma mensagem de erro mais útil
        let userMessage = error.message || 'Erro desconhecido';
        userMessage = userMessage.replace(/Notion/g, 'proposta');
        
        showErrorMessage(`❌ Erro ao salvar: ${userMessage}`);
    }
}

// 🆕 VALIDAR DISTRIBUIÇÃO ANTES DE SALVAR
function validateDistribution(distribution) {
    if (!distribution || typeof distribution !== 'object') {
        console.error('❌ Distribuição inválida: não é um objeto');
        return false;
    }

    let isValid = true;
    Object.entries(distribution).forEach(([dateKey, dayData]) => {
        // Validar formato da data
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
            console.error(`❌ Formato de data inválido: ${dateKey}`);
            isValid = false;
            return;
        }

        // Validar estrutura do dia
        if (!dayData || typeof dayData !== 'object') {
            console.error(`❌ Dados do dia inválidos para ${dateKey}:`, dayData);
            isValid = false;
            return;
        }

        // Validar se tem propriedades necessárias
        if (!dayData.hasOwnProperty('total') || !dayData.hasOwnProperty('products')) {
            console.error(`❌ Estrutura inválida para ${dateKey}:`, dayData);
            isValid = false;
            return;
        }

        // Validar total
        const total = parseInt(dayData.total) || 0;
        if (total < 0) {
            console.error(`❌ Total negativo para ${dateKey}: ${total}`);
            isValid = false;
            return;
        }

        // Validar produtos
        if (dayData.products && typeof dayData.products === 'object') {
            Object.entries(dayData.products).forEach(([productType, count]) => {
                const validCount = parseInt(count) || 0;
                if (validCount < 0) {
                    console.error(`❌ Quantidade negativa para ${productType} em ${dateKey}: ${count}`);
                    isValid = false;
                }
            });
        }
    });

    console.log(isValid ? '✅ Distribuição válida' : '❌ Distribuição inválida');
    return isValid;
}

function cancelEdit() {
    currentDistribution = JSON.parse(JSON.stringify(originalDistribution));
    
    // Recriar calendário
    const startDate = parseDate(campaignData.inicio);
    const endDate = parseDate(campaignData.fim);
    const selectedWeekdays = parseWeekdays(campaignData.dias);
    renderCalendar(startDate, endDate, selectedWeekdays);
    
    exitEditMode();
}

function resetAuto() {
    const activeProducts = getActiveProducts();
    currentDistribution = calculateDistribution(activeProducts, validDays);
    
    // Recriar calendário
    const startDate = parseDate(campaignData.inicio);
    const endDate = parseDate(campaignData.fim);
    const selectedWeekdays = parseWeekdays(campaignData.dias);
    renderCalendar(startDate, endDate, selectedWeekdays);
    
    showCurrentStatus();
}

function exitEditMode() {
    isEditMode = false;
    isDragging = false;
    dragStartCell = null;
    
    document.body.classList.remove('edit-mode');
    document.getElementById('actions-normal').style.display = 'flex';
    document.getElementById('actions-edit').style.display = 'none';
    document.getElementById('validation').style.display = 'none';
    
    // 🆕 REMOVER EDIÇÃO DA TABELA
    makeTableReadOnly();
}

// EDITAR PERÍODO E DIAS DA SEMANA
function editPeriod() {
    document.getElementById('period-modal').style.display = 'flex';
    
    // Preencher valores atuais
    const startDate = parseDate(campaignData.inicio);
    const endDate = parseDate(campaignData.fim);
    
    // 🆕 CONVERTER PARA FORMATO ISO CORRETAMENTE
    const startISO = startDate.toISOString().split('T')[0];
    const endISO = endDate.toISOString().split('T')[0];
    
    console.log('📅 Editando período:');
    console.log('  - Data início original:', campaignData.inicio);
    console.log('  - Data fim original:', campaignData.fim);
    console.log('  - Convertido para ISO início:', startISO);
    console.log('  - Convertido para ISO fim:', endISO);
    
    document.getElementById('period-start').value = startISO;
    document.getElementById('period-end').value = endISO;
    
    // Preencher dias da semana
    const currentDays = parseWeekdays(campaignData.dias);
    const dayCheckboxes = document.querySelectorAll('input[name="weekdays"]');
    dayCheckboxes.forEach((checkbox, index) => {
        checkbox.checked = currentDays.includes(index);
    });
}

async function savePeriod() {
    try {
        const startInput = document.getElementById('period-start').value;
        const endInput = document.getElementById('period-end').value;
        
        if (!startInput || !endInput) {
            alert('Por favor, preencha as datas');
            return;
        }
        
        // 🆕 CONVERSÃO CORRETA DE DATAS
        const startDate = new Date(startInput + 'T00:00:00');
        const endDate = new Date(endInput + 'T00:00:00');
        
        console.log('📅 Datas originais:', { startInput, endInput });
        console.log('📅 Datas convertidas:', { 
            start: startDate.toLocaleDateString('pt-BR'),
            end: endDate.toLocaleDateString('pt-BR')
        });
        
        if (startDate >= endDate) {
            alert('Data de início deve ser anterior à data de fim');
            return;
        }
        
        // Obter dias selecionados
        const selectedDays = [];
        const dayNames = ['Dom.', 'Seg.', 'Ter.', 'Qua.', 'Qui.', 'Sex.', 'Sáb.'];
        const dayCheckboxes = document.querySelectorAll('input[name="weekdays"]:checked');
        
        dayCheckboxes.forEach(checkbox => {
            selectedDays.push(dayNames[parseInt(checkbox.value)]);
        });
        
        if (selectedDays.length === 0) {
            alert('Selecione pelo menos um dia da semana');
            return;
        }
        
        showLoadingMessage('💾 Salvando período na proposta...');
        
        // 🆕 FORMATAR DATAS CORRETAMENTE
        const novoInicio = startDate.toLocaleDateString('pt-BR');
        const novoFim = endDate.toLocaleDateString('pt-BR');
        
        console.log('📤 Enviando datas:', { novoInicio, novoFim, dias: selectedDays });
        
        // Salvar na proposta
        await saveToNotion({
            inicio: novoInicio,
            fim: novoFim,
            dias: selectedDays,
            customDistribution: '' // 🆕 LIMPAR DISTRIBUIÇÃO CUSTOMIZADA
        });
        
        // Atualizar dados locais
        campaignData.inicio = novoInicio;
        campaignData.fim = novoFim;
        campaignData.dias = selectedDays.join(',');
        
        // 🆕 LIMPAR DISTRIBUIÇÃO CUSTOMIZADA (FORÇAR RECÁLCULO)
        campaignData.customDistributionData = null;
        
        // Recarregar interface
        renderInterface();
        
        document.getElementById('period-modal').style.display = 'none';
        showSuccessMessage('✅ Período salvo na proposta!');
        
    } catch (error) {
        console.error('❌ Erro ao salvar período:', error);
        showErrorMessage(`❌ Erro ao salvar período: ${error.message.replace(/Notion/g, 'proposta')}`);
    }
}

// FUNÇÕES DE FEEDBACK VISUAL
function showLoadingMessage(message) {
    removeAllMessages();
    const msg = document.createElement('div');
    msg.className = 'feedback-message loading';
    msg.textContent = message;
    msg.style.cssText = `
        position: fixed; top: 20px; right: 20px; z-index: 10000;
        background: #3b82f6; color: white; padding: 12px 20px;
        border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        font-weight: 600; font-size: 14px;
    `;
    document.body.appendChild(msg);
}

function showSuccessMessage(message) {
    removeAllMessages();
    const msg = document.createElement('div');
    msg.className = 'feedback-message success';
    msg.textContent = message;
    msg.style.cssText = `
        position: fixed; top: 20px; right: 20px; z-index: 10000;
        background: #10b981; color: white; padding: 12px 20px;
        border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        font-weight: 600; font-size: 14px;
    `;
    document.body.appendChild(msg);
    
    setTimeout(() => {
        if (msg.parentNode) msg.remove();
    }, 4000);
}

function showErrorMessage(message) {
    removeAllMessages();
    const msg = document.createElement('div');
    msg.className = 'feedback-message error';
    msg.textContent = message;
    msg.style.cssText = `
        position: fixed; top: 20px; right: 20px; z-index: 10000;
        background: #ef4444; color: white; padding: 12px 20px;
        border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        font-weight: 600; font-size: 14px;
    `;
    document.body.appendChild(msg);
    
    setTimeout(() => {
        if (msg.parentNode) msg.remove();
    }, 6000);
}

function removeAllMessages() {
    document.querySelectorAll('.feedback-message').forEach(msg => msg.remove());
}

// FECHAR MODAIS
function closePeriodModal() {
    document.getElementById('period-modal').style.display = 'none';
}

// EXPORTAÇÃO
function exportExcel() {
    try {
        if (typeof XLSX === 'undefined') {
            alert('Biblioteca XLSX não disponível. Verifique a conexão.');
            return;
        }
        
        const wb = XLSX.utils.book_new();
        createExactExcelStructure(wb);
        
        // Salvar arquivo
        const startDate = parseDate(campaignData.inicio);
        const monthName = getMonthName(startDate.getMonth(), startDate.getFullYear());
        const fileName = `${monthName.replace(' ', '_')}_${startDate.getFullYear()}.xlsx`;
        XLSX.writeFile(wb, fileName);
        
        console.log('✅ Exportação concluída:', fileName);
        
    } catch (error) {
        console.error('❌ Erro na exportação:', error);
        alert(`Erro ao exportar: ${error.message}`);
    }
}

function createExactExcelStructure(wb) {
    const startDate = parseDate(campaignData.inicio);
    const endDate = parseDate(campaignData.fim);
    const selectedWeekdays = parseWeekdays(campaignData.dias);
    
    // Criar array 2D vazio para 9 linhas x 31 colunas (A-AE)
    const data = [];
    for (let i = 0; i < 9; i++) {
        data[i] = new Array(31).fill('');
    }
    
    // LINHA 1: Título do mês (será mesclado A1:AE1)
    const monthTitle = getMonthName(startDate.getMonth(), startDate.getFullYear()).toUpperCase();
    data[0][0] = monthTitle;
    
    // LINHA 2: "PRODUTOS" na coluna A + números dos dias (01, 02, 03...)
    data[1][0] = 'PRODUTOS';
    for (let day = 1; day <= 30; day++) {
        data[1][day] = day.toString().padStart(2, '0');
    }
    
    // LINHA 3: Vazio na coluna A + dias da semana
    data[2][0] = ''; // Será parte da mesclagem A2:A3
    for (let day = 1; day <= 30; day++) {
        const date = new Date(startDate.getFullYear(), startDate.getMonth(), day);
        if (day <= new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0).getDate()) {
            const dayName = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'][date.getDay()];
            data[2][day] = dayName;
        }
    }
    
    // LINHAS 4-8: Produtos
    const productNames = ['SPOTS 30"', 'SPOTS 5"', 'SPOTS 15"', 'SPOTS 60"', 'TEST. 60"'];
    const productTypes = ['spots30', 'spots5', 'spots15', 'spots60', 'test60'];
    
    for (let i = 0; i < 5; i++) {
        const rowIndex = 3 + i; // Linhas 4-8 (índices 3-7)
        data[rowIndex][0] = productNames[i];
        
        // Preencher dados dos produtos
        for (let day = 1; day <= 30; day++) {
            const date = new Date(startDate.getFullYear(), startDate.getMonth(), day);
            const dateKey = date.toISOString().split('T')[0];
            const dayData = currentDistribution[dateKey];
            const spotCount = dayData?.products[productTypes[i]] || 0;
            
            // Verificar se é dia válido da campanha
            const isValidDay = selectedWeekdays.includes(date.getDay());
            const isInPeriod = date >= startDate && date <= endDate;
            const dayExists = day <= new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0).getDate();
            
            if (isValidDay && isInPeriod && dayExists && spotCount > 0) {
                data[rowIndex][day] = spotCount;
            }
        }
    }
    
    // LINHA 9: TOTAL POR DIA
    data[8][0] = 'TOTAL POR DIA';
    for (let day = 1; day <= 30; day++) {
        const date = new Date(startDate.getFullYear(), startDate.getMonth(), day);
        const dateKey = date.toISOString().split('T')[0];
        const dayData = currentDistribution[dateKey];
        const totalSpots = dayData?.total || 0;
        
        // Verificar se é dia válido da campanha
        const isValidDay = selectedWeekdays.includes(date.getDay());
        const isInPeriod = date >= startDate && date <= endDate;
        const dayExists = day <= new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0).getDate();
        
        if (isValidDay && isInPeriod && dayExists && totalSpots > 0) {
            data[8][day] = totalSpots;
        }
    }
    
    // Criar worksheet a partir do array
    const ws = XLSX.utils.aoa_to_sheet(data);
    
    // DEFINIR MESCLAGENS
    ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 30 } }, // A1:AE1 - Título do mês
        { s: { r: 1, c: 0 }, e: { r: 2, c: 0 } }   // A2:A3 - "PRODUTOS"
    ];
    
    // DEFINIR LARGURAS DAS COLUNAS
    ws['!cols'] = [
        { wch: 15 }, // Coluna A
        ...Array(30).fill({ wch: 4 }) // Colunas B-AE
    ];
    
    // APLICAR FORMATAÇÃO CÉLULA POR CÉLULA
    for (let R = 0; R <= 8; R++) {
        for (let C = 0; C <= 30; C++) {
            const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
            
            if (!ws[cellRef]) {
                ws[cellRef] = { v: '', t: 's' };
            }
            
            // Bordas padrão para todas as células
            const standardBorder = {
                top: { style: "thin", color: { rgb: "000000" } },
                bottom: { style: "thin", color: { rgb: "000000" } },
                left: { style: "thin", color: { rgb: "000000" } },
                right: { style: "thin", color: { rgb: "000000" } }
            };
            
            // FORMATAÇÃO POR POSIÇÃO
            if (R === 0) {
                // LINHA 1: Título do mês (A1:AE1) - Azul escuro, branco, negrito, centralizado
                ws[cellRef].s = {
                    fill: { fgColor: { rgb: "002060" } },
                    font: { color: { rgb: "FFFFFF" }, bold: true, sz: 14 },
                    alignment: { horizontal: "center", vertical: "center" },
                    border: standardBorder
                };
            }
            else if ((R === 1 || R === 2) && C === 0) {
                // A2:A3 "PRODUTOS" - Azul escuro, branco, negrito, centralizado
                ws[cellRef].s = {
                    fill: { fgColor: { rgb: "002060" } },
                    font: { color: { rgb: "FFFFFF" }, bold: true, sz: 12 },
                    alignment: { horizontal: "center", vertical: "center" },
                    border: standardBorder
                };
            }
            else if (R === 1 && C > 0) {
                // LINHA 2: Números dos dias - Verificar se é fim de semana ou dia especial
                const day = C;
                const date = new Date(startDate.getFullYear(), startDate.getMonth(), day);
                const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                const isSpecialDay = day === 15 || day === 30;
                const fontColor = (isWeekend || isSpecialDay) ? "FF0000" : "000000";
                
                ws[cellRef].s = {
                    font: { color: { rgb: fontColor }, bold: false, sz: 10 },
                    alignment: { horizontal: "center", vertical: "center" },
                    border: standardBorder
                };
            }
            else if (R === 2 && C > 0) {
                // LINHA 3: Dias da semana - Verificar se é fim de semana
                const day = C;
                const date = new Date(startDate.getFullYear(), startDate.getMonth(), day);
                const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                const isSpecialDay = day === 15 || day === 30;
                const fontColor = (isWeekend || isSpecialDay) ? "FF0000" : "000000";
                
                ws[cellRef].s = {
                    font: { color: { rgb: fontColor }, bold: false, sz: 10 },
                    alignment: { horizontal: "center", vertical: "center" },
                    border: standardBorder
                };
            }
            else if (R >= 3 && R <= 7 && C === 0) {
                // A4:A8 Nomes dos produtos - Azul escuro, branco, negrito, centralizado (SEM MESCLAR)
                ws[cellRef].s = {
                    fill: { fgColor: { rgb: "002060" } },
                    font: { color: { rgb: "FFFFFF" }, bold: true, sz: 10 },
                    alignment: { horizontal: "center", vertical: "center" },
                    border: standardBorder
                };
            }
            else if (R === 8 && C === 0) {
                // A9 "TOTAL POR DIA" - Branco, preto, negrito, centralizado
                ws[cellRef].s = {
                    fill: { fgColor: { rgb: "FFFFFF" } },
                    font: { color: { rgb: "000000" }, bold: true, sz: 10 },
                    alignment: { horizontal: "center", vertical: "center" },
                    border: standardBorder
                };
            }
            else {
                // CÉLULAS DE DADOS (B4:AE9)
                ws[cellRef].s = {
                    font: { color: { rgb: "000000" }, bold: false, sz: 10 },
                    alignment: { horizontal: "center", vertical: "center" },
                    border: standardBorder
                };
            }
        }
    }
    
    // Adicionar ao workbook
    const sheetName = getMonthName(startDate.getMonth(), startDate.getFullYear());
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
}

// UTILITÁRIOS
function showError(message) {
    document.getElementById('error-message').textContent = message;
    document.getElementById('error-message').style.display = 'block';
}
