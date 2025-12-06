const { proto, initAuthCreds, BufferJSON } = require('@whiskeysockets/baileys');

const useMongoDBAuthState = async (collection) => {
    // Helper para escribir datos (usando upsert para crear o actualizar)
    const writeData = async (data, id) => {
        try {
            const info = { 
                _id: id, 
                data: JSON.parse(JSON.stringify(data, BufferJSON.replacer)) 
            };
            
            // Usamos replaceOne con upsert para asegurar que se guarde
            await collection.replaceOne(
                { _id: id },
                info,
                { upsert: true }
            );
        } catch (error) {
            console.error('Error guardando sesión en Mongo:', error);
        }
    };

    // Helper para leer datos
    const readData = async (id) => {
        try {
            const result = await collection.findOne({ _id: id });
            if (result && result.data) {
                return JSON.parse(JSON.stringify(result.data), BufferJSON.reviver);
            }
            return null;
        } catch (error) {
            console.error('Error leyendo sesión de Mongo:', error);
            return null;
        }
    };

    const removeData = async (id) => {
        try {
            await collection.deleteOne({ _id: id });
        } catch (error) {
            console.error('Error borrando sesión de Mongo:', error);
        }
    };

    // Inicializamos credenciales
    const creds = (await readData('creds')) || initAuthCreds();

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    await Promise.all(
                        ids.map(async (id) => {
                            let value = await readData(`${type}-${id}`);
                            if (type === 'app-state-sync-key' && value) {
                                value = proto.Message.AppStateSyncKeyData.fromObject(value);
                            }
                            if (value) {
                                data[id] = value;
                            }
                        })
                    );
                    return data;
                },
                set: async (data) => {
                    const tasks = [];
                    for (const category in data) {
                        for (const id in data[category]) {
                            const value = data[category][id];
                            const key = `${category}-${id}`;
                            if (value) {
                                tasks.push(writeData(value, key));
                            } else {
                                tasks.push(removeData(key));
                            }
                        }
                    }
                    await Promise.all(tasks);
                }
            }
        },
        saveCreds: () => writeData(creds, 'creds'),
        // Esta es la función clave para arreglar el bucle:
        clearCreds: () => removeData('creds') 
    };
};

module.exports = { useMongoDBAuthState };