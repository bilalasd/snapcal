import SwiftUI

/// Ask Bevi — a chat over the user's own logged data. Ports ask-bevi.tsx.
///
/// The server holds the context (it re-reads meals and trends per request), so
/// the client only keeps the transcript. That's why the whole message array
/// goes up each time rather than a session id.
@MainActor
@Observable
final class AskBeviViewModel {
    struct Message: Identifiable, Codable, Equatable {
        var id = UUID()
        let role: String // "user" | "assistant"
        let content: String

        enum CodingKeys: String, CodingKey { case role, content }
    }

    var messages: [Message] = []
    var input = ""
    var sending = false

    private struct AskBody: Encodable {
        let messages: [Message]
        let tz_offset: Int
    }
    private struct AskResponse: Decodable { let reply: String }

    func send() async {
        let question = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !question.isEmpty, !sending else { return }
        input = ""
        messages.append(Message(role: "user", content: question))
        sending = true
        defer { sending = false }

        do {
            let response: AskResponse = try await APIClient.shared.post(
                "/api/ask", body: AskBody(messages: messages, tz_offset: tzOffsetMinutes()))
            messages.append(Message(role: "assistant", content: response.reply))
        } catch {
            // An error becomes an assistant turn rather than an alert: the
            // conversation stays readable, and the retry is just asking again.
            messages.append(Message(
                role: "assistant",
                content: "I couldn't reach the kitchen just then — ask me again in a moment."))
        }
    }
}

struct AskBeviView: View {
    @State private var vm = AskBeviViewModel()
    @Environment(\.dismiss) private var dismiss

    private let starters = [
        "How did last week actually go?",
        "Am I getting enough protein?",
        "What should I eat tonight?",
    ]

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                ScrollViewReader { proxy in
                    ScrollView {
                        VStack(alignment: .leading, spacing: Theme2.Space.m) {
                            if vm.messages.isEmpty { emptyState }
                            ForEach(vm.messages) { message in
                                bubble(message).id(message.id)
                            }
                            if vm.sending {
                                HStack(spacing: Theme2.Space.s) {
                                    ProgressView()
                                    Text("Bevi's thinking…")
                                        .font(Theme2.Text.caption)
                                        .foregroundStyle(Theme2.inkSecondary)
                                }
                            }
                        }
                        .padding(Theme2.Space.l)
                    }
                    .onChange(of: vm.messages.count) { _, _ in
                        withAnimation { proxy.scrollTo(vm.messages.last?.id, anchor: .bottom) }
                    }
                }
                composer
            }
            .background(Theme2.canvas)
            .navigationTitle("Ask Bevi")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    private var emptyState: some View {
        VStack(alignment: .leading, spacing: Theme2.Space.l) {
            EmptyStateView(
                title: "Ask me anything",
                message: "I can see what you've logged, so ask about your week, your macros, or what to eat next.",
                bevi: "bevi-clipboard")
            ForEach(starters, id: \.self) { starter in
                Button {
                    vm.input = starter
                    Task { await vm.send() }
                } label: {
                    SurfaceCard {
                        HStack {
                            Text(starter).font(Theme2.Text.body).foregroundStyle(Theme2.ink)
                                .multilineTextAlignment(.leading)
                            Spacer(minLength: Theme2.Space.s)
                            Image(systemName: "arrow.up.circle")
                                .foregroundStyle(Theme2.inkSecondary)
                        }
                    }
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func bubble(_ message: AskBeviViewModel.Message) -> some View {
        HStack {
            if message.role == "user" { Spacer(minLength: Theme2.Space.xl) }
            Group {
                if message.role == "user" {
                    Text(message.content)
                        .font(Theme2.Text.body)
                        .foregroundStyle(Theme2.blockInk)
                        .padding(Theme2.Space.m)
                        .background(Theme2.Block.lime, in: RoundedRectangle(cornerRadius: Theme2.Radius.card))
                } else {
                    Text(message.content)
                        .font(Theme2.Text.body)
                        .foregroundStyle(Theme2.ink)
                        .padding(Theme2.Space.m)
                        .background(Theme2.surface, in: RoundedRectangle(cornerRadius: Theme2.Radius.card))
                }
            }
            if message.role != "user" { Spacer(minLength: Theme2.Space.xl) }
        }
        .accessibilityLabel("\(message.role == "user" ? "You" : "Bevi"): \(message.content)")
    }

    private var composer: some View {
        HStack(spacing: Theme2.Space.m) {
            TextField("Ask about your logging…", text: $vm.input, axis: .vertical)
                .font(Theme2.Text.body)
                .lineLimit(1...4)
                .padding(Theme2.Space.m)
                .background(Theme2.canvas, in: RoundedRectangle(cornerRadius: Theme2.Radius.control))
                .onSubmit { Task { await vm.send() } }
            Button {
                Task { await vm.send() }
            } label: {
                Image(systemName: "arrow.up")
                    .font(Theme2.Text.label)
                    .foregroundStyle(.white)
                    .frame(width: 44, height: 44)
                    .background(Theme2.accentLog, in: Circle())
            }
            .disabled(vm.input.trimmingCharacters(in: .whitespaces).isEmpty || vm.sending)
            .accessibilityLabel("Send")
        }
        .padding(Theme2.Space.l)
        .background(Theme2.surface)
    }
}
