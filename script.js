// VARIÁVEIS GLOBAIS
let isEditMode = false;
let campaignData = {};
let originalDistribution = {};
let currentDistribution = {};
let validDays = [];
let totalSpots = 0;

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

// CARREGAR DADOS
async function loadCampaignData() {
    const params = new URLSearchParams(window.location.search);
    const notionId = params.get('id');
    
    if (notionId && /^[0-9a-f]{32}$/i.test(notionId)) {
        console.log('📡 Carregando do Notion:', notionId);
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

// BUSCAR DADOS DO NOTION
async function fetchNotionData(uuid) {
    const response = await fetch(`/.netlify/functions/notion?id=${uuid}`);
    if (!response.ok) {
        throw new Error(`Erro ao carregar dados do Notion: ${response.status}`);
    }
    return await response.json();
}

// RENDERIZAR INTERFACE
function renderInterface() {
    const startDate = parseDate(campaignData.inicio);
    const endDate = parseDate(campaignData.fim);
    const selectedWeekdays = parseWeekdays(campaignData.dias);
    const activeProducts = getActiveProducts();
    
    totalSpots = Object.values(activeProducts).reduce((sum, count) => sum + count, 0);
    validDays = getValidDays(startDate, endDate, selectedWeekdays);
    
    // Validações
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        throw new Error('Datas inválidas');
    }
    if (validDays.length === 0) {
        throw new Error('Nenhum dia válido encontrado');
    }
    
    // Calcular distribuição
    currentDistribution = calculateDistribution(activeProducts, validDays);
    originalDistribution = JSON.parse(JSON.stringify(currentDistribution));
    
    // Renderizar elementos
    updateHeader();
    updateProducts(activeProducts);
    updateStats(startDate, endDate);
    updateActions();
    renderCalendar(startDate, endDate, selectedWeekdays);
    
    // Mostrar interface
    document.getElementById('stats').style.display = 'grid';
    document.getElementById('actions-normal').style.display = 'flex';
}

// UTILITÁRIOS DE DATA
function parseDate(dateStr) {
    const [day, month, year] = dateStr.split('/');
    return new Date(year, month - 1, day);
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
    
    Object.entries(activeProducts).forEach(([type, count]) => {
        if (count > 0) {
            const tag = document.createElement('span');
            tag.className = `product-tag tag-${type}`;
            tag.textContent = `${getProductName(type)}: ${count}`;
            container.appendChild(tag);
        }
    });
    
    document.getElementById('products-section').style.display = 'block';
}

function updateStats(startDate, endDate) {
    const activeProducts = getActiveProducts();
    const periodRange = `${startDate.getDate().toString().padStart(2, '0')}/${(startDate.getMonth() + 1).toString().padStart(2, '0')}-${endDate.getDate().toString().padStart(2, '0')}/${(endDate.getMonth() + 1).toString().padStart(2, '0')}`;
    const avgSpots = validDays.length > 0 ? (totalSpots / validDays.length).toFixed(1) : '0';
    const totalImpact = calculateImpact(activeProducts);
    
    document.getElementById('stat-period').textContent = periodRange;
    document.getElementById('stat-spots').textContent = totalSpots;
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
    
    // Gerar meses
    const months = new Set();
    const current = new Date(startDate);
    
    while (current <= endDate) {
        months.add(`${current.getFullYear()}-${current.getMonth()}`);
        current.setMonth(current.getMonth() + 1);
        current.setDate(1);
    }
    
    months.forEach(monthKey => {
        const [year, month] = monthKey.split('-').map(Number);
        const monthElement = createHorizontalMonthCalendar(year, month, selectedWeekdays);
        container.appendChild(monthElement);
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
    const activeProducts = getActiveProducts();
    
    // Linhas de produtos
    Object.entries(activeProducts).forEach(([productType, totalSpots]) => {
        if (totalSpots > 0) {
            const row = createProductRow(productType, monthDays);
            tbody.appendChild(row);
        }
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
    
    const current = new Date(firstDay);
    while (current <= lastDay) {
        // Verificar se está dentro do período da campanha
        const startDate = parseDate(campaignData.inicio);
        const endDate = parseDate(campaignData.fim);
        
        if (current >= startDate && current <= endDate) {
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

// EDIÇÃO INLINE
function startEdit() {
    isEditMode = true;
    document.body.classList.add('edit-mode');
    document.getElementById('actions-normal').style.display = 'none';
    document.getElementById('actions-edit').style.display = 'flex';
    
    // Salvar estado original
    originalDistribution = JSON.parse(JSON.stringify(currentDistribution));
    
    // Tornar células editáveis
    makeTableEditable();
    
    // Mostrar tooltip de ajuda
    showEditHelpTooltip();
    
    validateDistribution();
}

// TORNAR TABELA EDITÁVEL
function makeTableEditable() {
    const cells = document.querySelectorAll('.day-cell');
    
    cells.forEach(cell => {
        const dateKey = cell.dataset.date;
        const productType = cell.dataset.productType;
        
        // Verificar se é dia válido
        const date = new Date(dateKey + 'T00:00:00');
        const selectedWeekdays = parseWeekdays(campaignData.dias);
        const isValidDay = selectedWeekdays.includes(date.getDay());
        
        if (isValidDay && productType) {
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

// REMOVER EDIÇÃO DA TABELA
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

// MANIPULAR FOCO NA CÉLULA
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

// MANIPULAR ENTRADA DE DADOS
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

// MANIPULAR TECLAS
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

// MANIPULAR SAÍDA DA CÉLULA
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
    
    // Atualizar célula
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
    
    // Validar distribuição
    validateDistribution();
}

// ENCONTRAR PRÓXIMA CÉLULA EDITÁVEL
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

// MOSTRAR TOOLTIP DE AJUDA
function showEditHelpTooltip() {
    const tooltip = document.createElement('div');
    tooltip.className = 'edit-help-tooltip';
    tooltip.innerHTML = `
        <strong>💡 Modo de Edição Ativo</strong><br>
        • Clique nas células amarelas para editar<br>
        • Enter/Tab: próxima célula<br>
        • Esc: cancelar alteração
    `;
    
    document.body.appendChild(tooltip);
    
    // Remover após 5 segundos
    setTimeout(() => {
        if (tooltip.parentNode) {
            tooltip.remove();
        }
    }, 5000);
}

function validateDistribution() {
    const totalUsed = Object.values(currentDistribution).reduce((sum, day) => sum + (day.total || 0), 0);
    const validation = document.getElementById('validation');
    
    validation.style.display = 'block';
    
    if (totalUsed === totalSpots) {
        validation.className = 'validation success';
        validation.textContent = `✅ Distribuição válida! Total: ${totalUsed}/${totalSpots}`;
    } else if (totalUsed < totalSpots) {
        const remaining = totalSpots - totalUsed;
        validation.className = 'validation warning';
        validation.textContent = `⚠️ Faltam ${remaining} inserções (${totalUsed}/${totalSpots})`;
    } else {
        const excess = totalUsed - totalSpots;
        validation.className = 'validation error';
        validation.textContent = `❌ ${excess} inserções a mais (${totalUsed}/${totalSpots})`;
    }
}

function saveEdit() {
    const totalUsed = Object.values(currentDistribution).reduce((sum, day) => sum + (day.total || 0), 0);
    
    if (totalUsed !== totalSpots) {
        if (!confirm(`Total atual: ${totalUsed}, necessário: ${totalSpots}. Continuar mesmo assim?`)) {
            return;
        }
    }
    
    originalDistribution = JSON.parse(JSON.stringify(currentDistribution));
    exitEditMode();
    
    // Feedback visual
    const successMsg = document.createElement('div');
    successMsg.className = 'validation success';
    successMsg.style.position = 'fixed';
    successMsg.style.top = '20px';
    successMsg.style.right = '20px';
    successMsg.style.zIndex = '10000';
    successMsg.textContent = '✅ Distribuição salva com sucesso!';
    
    document.body.appendChild(successMsg);
    
    setTimeout(() => {
        if (successMsg.parentNode) {
            successMsg.remove();
        }
    }, 3000);
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
    
    validateDistribution();
}

function exitEditMode() {
    isEditMode = false;
    document.body.classList.remove('edit-mode');
    document.getElementById('actions-normal').style.display = 'flex';
    document.getElementById('actions-edit').style.display = 'none';
    document.getElementById('validation').style.display = 'none';
    
    // Remover edição da tabela
    makeTableReadOnly();
    
    // Remover tooltip de ajuda se existir
    const helpTooltip = document.querySelector('.edit-help-tooltip');
    if (helpTooltip) {
        helpTooltip.remove();
    }
}

// EXPORTAÇÃO COM ESTRUTURA EXATA DO "Excel ideal.png"
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

function createInfoSheet(wb) {
    const startDate = parseDate(campaignData.inicio);
    const endDate = parseDate(campaignData.fim);
    const activeProducts = getActiveProducts();
    
    const infoData = [
        ['INFORMAÇÕES DA CAMPANHA'],
        [''],
        ['Emissora:', campaignData.emissora],
        ['Período:', `${formatDate(startDate)} a ${formatDate(endDate)}`],
        ['Dias de veiculação:', campaignData.dias],
        ['PMM (Pessoas por Mil):', campaignData.pmm || 1000],
        [''],
        ['PRODUTOS CONTRATADOS:'],
        ['']
    ];
    
    Object.entries(activeProducts).forEach(([type, count]) => {
        if (count > 0) {
            infoData.push([getProductName(type), count]);
        }
    });
    
    infoData.push(['']);
    infoData.push(['RESUMO GERAL:']);
    infoData.push(['Total de inserções:', totalSpots]);
    infoData.push(['Dias ativos:', validDays.length]);
    infoData.push(['Impactos total:', calculateImpact(activeProducts).toLocaleString()]);
    infoData.push(['Média inserções/dia:', validDays.length > 0 ? (totalSpots / validDays.length).toFixed(1) : '0']);
    
    const infoWs = XLSX.utils.aoa_to_sheet(infoData);
    infoWs['!cols'] = [{ wch: 25 }, { wch: 20 }];
    
    // Formatação da planilha de informações
    const range = XLSX.utils.decode_range(infoWs['!ref']);
    for (let R = range.s.r; R <= range.e.r; ++R) {
        for (let C = range.s.c; C <= range.e.c; ++C) {
            const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
            if (!infoWs[cellAddress]) continue;
            
            if (!infoWs[cellAddress].s) infoWs[cellAddress].s = {};
            
            // Títulos das seções
            if (infoWs[cellAddress].v && typeof infoWs[cellAddress].v === 'string' && 
                (infoWs[cellAddress].v.includes('INFORMAÇÕES') || 
                 infoWs[cellAddress].v.includes('PRODUTOS') || 
                 infoWs[cellAddress].v.includes('RESUMO'))) {
                infoWs[cellAddress].s = {
                    fill: { fgColor: { rgb: "06055B" } },
                    font: { color: { rgb: "FFFFFF" }, bold: true, sz: 12 },
                    alignment: { horizontal: "center", vertical: "center" }
                };
            }
        }
    }
    
    XLSX.utils.book_append_sheet(wb, infoWs, 'Informações');
}

// UTILITÁRIOS
function showError(message) {
    document.getElementById('error-message').textContent = message;
    document.getElementById('error-message').style.display = 'block';
}