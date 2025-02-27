

onconnect = async (event) => {
    const port = event.ports[0];
    console.log('LSP worker connected on port: ', port);
}