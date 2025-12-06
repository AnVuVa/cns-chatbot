// Mô phỏng Interface trong JS
class IAIProvider {
    async generateResponse(prompt, context) {
      throw new Error("Method 'generateResponse()' must be implemented.");
    }
}
module.exports = IAIProvider;