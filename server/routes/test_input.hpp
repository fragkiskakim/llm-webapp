#ifndef DCC_APPLICATION_H
#define DCC_APPLICATION_H

#include <string>
#include <vector>
#include <optional>
#include <cstdint>


// =========================
// Data Tier (Persistence)
// =========================
namespace Data {

    struct DataCoordinateGroupRecord final {
        int id;
        std::string label;
        double x;
        double y;
        double r;
        double theta;
        std::int64_t timestampEpochSeconds;
    };

    class DataMySqlConnection final {
    private:
        std::string host_;
        int port;
        std::string database_;
        std::string username_;
        std::string password_;
        bool connected;

    public:
        DataMySqlConnection(const std::string& host,
                            int port,
                            const std::string& database,
                            const std::string& username,
                            const std::string& password);

        void connect();
        void disconnect();
        bool isConnected() const;

        const std::string& host() const;
        int port() const;
        const std::string& database() const;
    };

    class DataCoordinateGroupRepository final {
    private:
        DataMySqlConnection& connection_;

    public:
        explicit DataCoordinateGroupRepository(DataMySqlConnection& connection);

        int insert(const DataCoordinateGroupRecord& record);
        bool update(const DataCoordinateGroupRecord& record);
        bool removeById(int id);

        std::optional<DataCoordinateGroupRecord> findById(int id) const;
        std::vector<DataCoordinateGroupRecord> findByLabel(const std::string& label) const;
        std::vector<DataCoordinateGroupRecord> findAll() const;
    };

} // namespace Data

// =========================
// Business Tier (Domain/Logic)
// =========================
namespace Business {

    struct BusinessCartesianCoord final {
        double x;
        double y;
    };

    struct BusinessPolarCoord final {
        double r;
        double theta;
    };

    struct BusinessCoordinateGroup final {
        int id;
        std::string label;
        std::int64_t timestampEpochSeconds;
        BusinessCartesianCoord cartesian;
        BusinessPolarCoord polar;
    };

    class BusinessCoordinateConverter final {
    public:
        BusinessCartesianCoord toCartesian(const BusinessPolarCoord& polar) const;
        BusinessPolarCoord toPolar(const BusinessCartesianCoord& cartesian) const;
    };

    class BusinessCoordinateGroupService final {
    private:
        Data::DataCoordinateGroupRepository& repository_;
        BusinessCoordinateConverter converter_;

        BusinessCoordinateGroup mapToDomain(const Data::DataCoordinateGroupRecord& record) const;
        Data::DataCoordinateGroupRecord mapToRecord(const BusinessCoordinateGroup& group) const;

    public:
        explicit BusinessCoordinateGroupService(Data::DataCoordinateGroupRepository& repository);

        BusinessCoordinateGroup createFromCartesian(const std::string& label,
                                                   const BusinessCartesianCoord& cartesian);

        BusinessCoordinateGroup createFromPolar(const std::string& label,
                                               const BusinessPolarCoord& polar);

        std::vector<BusinessCoordinateGroup> getAll() const;
        std::vector<BusinessCoordinateGroup> searchByLabel(const std::string& label) const;
        std::optional<BusinessCoordinateGroup> getById(int id) const;

        bool updateGroup(const BusinessCoordinateGroup& updated);
        bool deleteById(int id);
    };

} // namespace Business

// =========================
// Presentation Tier (UI/Controller)
// =========================
namespace Presentation {

    class PresentationCoordinateGroupFormView final {
    private:
        std::string labelInput;
        bool inputIsCartesian;
        double xInput;
        double yInput;
        double rInput;
        double thetaInput;

    public:
        PresentationCoordinateGroupFormView();

        void setLabel(const std::string& label);
        const std::string& label() const;

        void setInputModeCartesian(bool isCartesian);
        bool inputModeIsCartesian() const;

        void setCartesianInputs(double x, double y);
        void setPolarInputs(double r, double theta);

        double xInput() const;
        double yInput() const;
        double rInput() const;
        double thetaInput() const;

        void clear();
    };

    class PresentationCoordinateGroupListView final {
    private:
        std::vector<Business::BusinessCoordinateGroup> items_;
        std::optional<int> selectedId_;

    public:
        PresentationCoordinateGroupListView();

        void setItems(const std::vector<Business::BusinessCoordinateGroup>& items);
        const std::vector<Business::BusinessCoordinateGroup>& items() const;

        void setSelectedId(std::optional<int> id);
        std::optional<int> selectedId() const;

        void clearSelection();
    };

    class PresentationCoordinateGroupController final {
    private:
        Business::BusinessCoordinateGroupService& service_;
        PresentationCoordinateGroupFormView& formView_;
        PresentationCoordinateGroupListView& listView_;

    public:
        PresentationCoordinateGroupController(Business::BusinessCoordinateGroupService& service,
                                              PresentationCoordinateGroupFormView& formView,
                                              PresentationCoordinateGroupListView& listView);

        void onCreateRequested();
        void onRefreshAllRequested();
        void onSearchByLabelRequested(const std::string& label);
        void onSelectRequested(int id);
        void onUpdateRequested();
        void onDeleteRequested(int id);
    };

    class PresentationSwingMainWindow final {
    private:
        PresentationCoordinateGroupFormView formView_;
        PresentationCoordinateGroupListView listView_;
        PresentationCoordinateGroupController& controller_;

    public:
        explicit PresentationSwingMainWindow(PresentationCoordinateGroupController& controller);

        PresentationCoordinateGroupFormView& formView();
        PresentationCoordinateGroupListView& listView();

        void show();
        void close();
    };

} // namespace Presentation


#endif