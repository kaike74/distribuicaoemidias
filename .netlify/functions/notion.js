exports.handler = async (event, context) => {
  // Permitir CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Responder OPTIONS para CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  try {
    const notionToken = process.env.DistribuicaoHTML;
    if (!notionToken) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Token do Notion não configurado' })
      };
    }

    // MÉTODO GET - BUSCAR DADOS
    if (event.httpMethod === 'GET') {
      const { id } = event.queryStringParameters || {};
      
      if (!id) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'ID do registro é obrigatório' })
        };
      }

      console.log('🔍 Buscando página:', id);

      // Buscar dados da página no Notion
      const response = await fetch(`https://api.notion.com/v1/pages/${id}`, {
        headers: {
          'Authorization': `Bearer ${notionToken}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        console.error('❌ Erro da API Notion:', response.status);
        let errorDetails = response.statusText;
        try {
          const errorBody = await response.text();
          errorDetails = errorBody;
        } catch (e) {
          console.log('Não foi possível ler corpo do erro');
        }
        
        return {
          statusCode: response.status,
          headers,
          body: JSON.stringify({ 
            error: `Erro ao buscar dados do Notion: ${response.status}`,
            details: errorDetails
          })
        };
      }

      const notionData = await response.json();
      console.log('✅ Dados recebidos do Notion');

      // Mapear propriedades
      const properties = notionData.properties || {};
      
      const extractValue = (prop, defaultValue = '', propName = '') => {
        if (!prop) {
          console.log(`❌ Propriedade "${propName}" não encontrada`);
          return defaultValue;
        }
        
        switch (prop.type) {
          case 'number':
            const numberValue = prop.number !== null && prop.number !== undefined ? prop.number : 0;
            return numberValue;
          case 'title':
            return prop.title?.[0]?.text?.content || defaultValue;
          case 'rich_text':
            return prop.rich_text?.[0]?.text?.content || defaultValue;
          case 'date':
            return prop.date?.start || defaultValue;
          case 'multi_select':
            return prop.multi_select?.map(item => item.name).join(',') || defaultValue;
          case 'select':
            return prop.select?.name || defaultValue;
          default:
            return defaultValue;
        }
      };

      // Buscar PMM
      const pmmVariations = ['PMM', 'pmm', 'Pmm', 'PMM ', ' PMM'];
      let pmmProperty = null;
      
      for (const variation of pmmVariations) {
        if (properties[variation]) {
          pmmProperty = properties[variation];
          break;
        }
      }
      
      if (!pmmProperty) {
        for (const [key, value] of Object.entries(properties)) {
          if (key.toLowerCase().includes('pmm')) {
            pmmProperty = value;
            break;
          }
        }
      }

      // Mapear dados básicos
      const mappedData = {
        spots30: extractValue(properties['Spots 30ʺ'] || properties['Spots 30'] || properties['spots30'], 0, 'Spots 30'),
        spots5: extractValue(properties['Spots 5ʺ'] || properties['Spots 5'] || properties['spots5'], 0, 'Spots 5'),
        spots15: extractValue(properties['Spots 15ʺ'] || properties['Spots 15'] || properties['spots15'], 0, 'Spots 15'),
        spots60: extractValue(properties['Spots 60ʺ'] || properties['Spots 60'] || properties['spots60'], 0, 'Spots 60'),
        test60: extractValue(properties['Test. 60ʺ'] || properties['Test 60'] || properties['test60'], 0, 'Test 60'),
        pmm: pmmProperty ? extractValue(pmmProperty, 1000) : 1000,
        emissora: extractValue(properties['Emissora'] || properties['emissora'], 'Emissora', 'Emissora'),
        inicio: extractValue(properties['Data inicio'] || properties['Data Início'] || properties['inicio'], '01/01/2025', 'Data Início'),
        fim: extractValue(properties['Data fim'] || properties['Data Fim'] || properties['fim'], '31/01/2025', 'Data Fim'),
        dias: extractValue(properties['Dias da semana'] || properties['Dias'] || properties['dias'], 'Seg.,Ter.,Qua.,Qui.,Sex.', 'Dias da Semana'),
        // 🆕 NOVO CAMPO: Distribuição Customizada
        customDistribution: extractValue(properties['Distribuição Customizada'] || properties['Distribuicao Customizada'], '', 'Distribuição Customizada')
      };

      // Converter datas do formato ISO para DD/MM/YYYY se necessário
      if (mappedData.inicio && mappedData.inicio.includes('-')) {
        const startDate = new Date(mappedData.inicio);
        mappedData.inicio = startDate.toLocaleDateString('pt-BR');
      }
      
      if (mappedData.fim && mappedData.fim.includes('-')) {
        const endDate = new Date(mappedData.fim);
        mappedData.fim = endDate.toLocaleDateString('pt-BR');
      }

      // 🆕 PROCESSAR DISTRIBUIÇÃO CUSTOMIZADA
      if (mappedData.customDistribution) {
        try {
          mappedData.customDistributionData = JSON.parse(mappedData.customDistribution);
          console.log('✅ Distribuição customizada encontrada');
        } catch (e) {
          console.log('⚠️ Erro ao parsear distribuição customizada:', e);
          mappedData.customDistributionData = null;
        }
      }

      console.log('📋 Dados mapeados finais:', mappedData);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(mappedData)
      };
    }

    // MÉTODO POST/PUT - ATUALIZAR DADOS
    if (event.httpMethod === 'POST' || event.httpMethod === 'PUT') {
      const { id } = event.queryStringParameters || {};
      
      if (!id) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'ID do registro é obrigatório' })
        };
      }

      let requestBody;
      try {
        requestBody = JSON.parse(event.body);
      } catch (e) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Body inválido' })
        };
      }

      console.log('🔄 Atualizando página:', id);
      console.log('📝 Dados recebidos:', requestBody);

      // Preparar propriedades para atualização
      const updateProperties = {};

      // 🆕 ATUALIZAR DISTRIBUIÇÃO CUSTOMIZADA
      if (requestBody.customDistribution !== undefined) {
        updateProperties['Distribuição Customizada'] = {
          rich_text: [
            {
              text: {
                content: typeof requestBody.customDistribution === 'string' 
                  ? requestBody.customDistribution 
                  : JSON.stringify(requestBody.customDistribution)
              }
            }
          ]
        };
        console.log('📊 Atualizando distribuição customizada');
      }

      // 🆕 ATUALIZAR QUANTIDADES DE PRODUTOS
      if (requestBody.spots30 !== undefined) {
        updateProperties['Spots 30ʺ'] = { number: requestBody.spots30 };
      }
      if (requestBody.spots5 !== undefined) {
        updateProperties['Spots 5ʺ'] = { number: requestBody.spots5 };
      }
      if (requestBody.spots15 !== undefined) {
        updateProperties['Spots 15ʺ'] = { number: requestBody.spots15 };
      }
      if (requestBody.spots60 !== undefined) {
        updateProperties['Spots 60ʺ'] = { number: requestBody.spots60 };
      }
      if (requestBody.test60 !== undefined) {
        updateProperties['Test. 60ʺ'] = { number: requestBody.test60 };
      }

      // 🆕 ATUALIZAR PERÍODO E DIAS
      if (requestBody.inicio !== undefined) {
        updateProperties['Data inicio'] = {
          date: {
            start: convertToISO(requestBody.inicio)
          }
        };
      }
      if (requestBody.fim !== undefined) {
        updateProperties['Data fim'] = {
          date: {
            start: convertToISO(requestBody.fim)
          }
        };
      }
      if (requestBody.dias !== undefined) {
        // Converter array de dias para formato do Notion
        const diasArray = Array.isArray(requestBody.dias) ? requestBody.dias : requestBody.dias.split(',');
        updateProperties['Dias da semana'] = {
          multi_select: diasArray.map(dia => ({ name: dia.trim() }))
        };
      }

      // Fazer requisição de atualização
      const updateResponse = await fetch(`https://api.notion.com/v1/pages/${id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${notionToken}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          properties: updateProperties
        })
      });

      if (!updateResponse.ok) {
        console.error('❌ Erro ao atualizar Notion:', updateResponse.status);
        let errorDetails = updateResponse.statusText;
        try {
          const errorBody = await updateResponse.text();
          errorDetails = errorBody;
        } catch (e) {
          console.log('Não foi possível ler corpo do erro');
        }
        
        return {
          statusCode: updateResponse.status,
          headers,
          body: JSON.stringify({ 
            error: `Erro ao atualizar dados no Notion: ${updateResponse.status}`,
            details: errorDetails
          })
        };
      }

      const updateResult = await updateResponse.json();
      console.log('✅ Página atualizada com sucesso');

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          success: true, 
          message: 'Dados atualizados com sucesso',
          updated: updateResult
        })
      };
    }

    // Método não suportado
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Método não permitido' })
    };

  } catch (error) {
    console.error('💥 Erro na função:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Erro interno do servidor',
        details: error.message
      })
    };
  }
};

// Função helper para converter data DD/MM/YYYY para ISO
function convertToISO(dateStr) {
  if (dateStr.includes('-')) {
    return dateStr; // Já está em formato ISO
  }
  
  const [day, month, year] = dateStr.split('/');
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}
